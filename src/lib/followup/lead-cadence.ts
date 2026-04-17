import { createAdminClient } from '@/lib/supabase/admin'
import { isWithinWorkingHours, logFollowupSkip } from '@/lib/followup/business-hours'
import {
  resolveLeadSteps,
  renderTemplate,
  sendFollowupMessage,
  logFollowupEvent,
  FollowupCircuitBreaker,
  isWhatsAppConnected,
} from '@/lib/followup/shared'
import type { PanelBotConfig, PanelWhatsAppConfig, FollowupStepConfig } from '@/types/database'

interface LeadConversation {
  id: string
  contact_id: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
}

interface ContactRow {
  id: string
  name: string | null
  phone_number: string | null
  identifier: string | null
}

interface ClientFollowupContext {
  clientId: string
  botConfig: PanelBotConfig
  whatsappConfig: PanelWhatsAppConfig
}

export interface LeadCadenceSummary {
  clients: number
  stepsSent: number
  skippedOutsideHours: boolean
}

function resolveLeadStepKey(lastOutgoingAt: string, steps: FollowupStepConfig[]): { stepKey: string; template: string } | null {
  const elapsedHours = (Date.now() - new Date(lastOutgoingAt).getTime()) / (1000 * 60 * 60)
  const match = steps.find((step) => elapsedHours >= step.min_hours && elapsedHours < step.max_hours)
  return match ? { stepKey: match.step_key, template: match.template } : null
}

async function queryLeadConversations(clientId: string): Promise<LeadConversation[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_id, last_incoming_at, last_outgoing_at')
    .eq('client_id', clientId)
    .neq('status', 'resolved')
    .not('last_outgoing_at', 'is', null)
    .limit(500)

  if (error) throw error

  // Filtrar conversas suprimidas para lead
  const suppressed = await import('./shared').then(m => m.getSuppressedConversations(clientId, 'lead'));

  return ((data ?? []) as LeadConversation[]).filter((c) => {
    if (suppressed.has(c.id)) return false;
    if (!c.last_outgoing_at || !c.last_incoming_at) return false;
    return new Date(c.last_incoming_at).getTime() < new Date(c.last_outgoing_at).getTime();
  })
}

async function queryConversationsWithScheduledAppointment(conversationIds: string[]): Promise<Set<string>> {
  if (!conversationIds.length) return new Set()

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('conversation_id')
    .eq('status', 'scheduled')
    .gt('start_at', new Date().toISOString())
    .in('conversation_id', conversationIds)

  if (error) throw error
  return new Set((data ?? []).map((r: { conversation_id: string | null }) => r.conversation_id).filter(Boolean) as string[])
}

async function queryContacts(contactIds: string[]): Promise<Map<string, ContactRow>> {
  if (!contactIds.length) return new Map()

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', [...new Set(contactIds)])

  if (error) throw error
  return new Map((data ?? []).map((c: ContactRow) => [c.id, c]))
}

async function processClient(ctx: ClientFollowupContext, breaker: FollowupCircuitBreaker): Promise<number> {
  if (!isWithinWorkingHours(ctx.botConfig.working_hours, ctx.botConfig.timezone ?? 'America/Sao_Paulo')) {
    logFollowupSkip('lead', 'fora_do_horario', { clientId: ctx.clientId })
    return 0
  }

  const steps = resolveLeadSteps(ctx.botConfig)
  if (!steps.length) {
    logFollowupEvent('lead', 'skipped', { clientId: ctx.clientId, reason: 'no_enabled_steps' })
    return 0
  }

  const conversations = await queryLeadConversations(ctx.clientId)
  if (!conversations.length) {
    logFollowupSkip('lead', 'sem_conversas', { clientId: ctx.clientId })
    return 0
  }

  const scheduledConversationIds = await queryConversationsWithScheduledAppointment(
    conversations.map((c) => c.id)
  )

  const candidates = conversations.filter((c) => !scheduledConversationIds.has(c.id))
  if (!candidates.length) {
    logFollowupSkip('lead', 'sem_candidatos_pos_filtro', { clientId: ctx.clientId })
    return 0
  }

  const contactsMap = await queryContacts(
    candidates.map((c) => c.contact_id).filter(Boolean) as string[]
  )

  let sentCount = 0
  const instanceName = ctx.whatsappConfig.evolution_instance_name

  for (const conversation of candidates) {
    if (breaker.isOpen(ctx.clientId)) {
      logFollowupEvent('lead', 'circuit_open', { clientId: ctx.clientId })
      break
    }

    if (!conversation.last_outgoing_at || !conversation.contact_id) {
      logFollowupSkip('lead', 'sem_contato_ou_last_outgoing', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      continue
    }

    const resolved = resolveLeadStepKey(conversation.last_outgoing_at, steps)
    if (!resolved) {
      logFollowupSkip('lead', 'sem_step_elegivel', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      continue
    }

    const contact = contactsMap.get(conversation.contact_id)
    if (!contact) {
      logFollowupSkip('lead', 'contato_nao_encontrado', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      continue
    }

    const recipient = contact.identifier ?? contact.phone_number
    if (!recipient) continue

    const message = renderTemplate(resolved.template, {
      patient_name: contact.name ?? 'Paciente',
      professional_name: ctx.botConfig.professional_name,
      business_name: ctx.botConfig.business_name ?? ctx.botConfig.professional_name,
    })

    try {
      const wasSent = await sendFollowupMessage({
        clientId: ctx.clientId,
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        recipient,
        instanceName,
        cadenceType: 'lead',
        stepKey: resolved.stepKey,
        message,
      })
      if (wasSent) {
        sentCount++
        breaker.recordSuccess(ctx.clientId)
      }
    } catch (error) {
      breaker.recordFailure(ctx.clientId)
      console.error(`[Followup Lead] Erro para conversation=${conversation.id}:`, error)
    }
  }

  return sentCount
}

export async function runLeadCadencePipeline(): Promise<LeadCadenceSummary> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('lead_followup_enabled', true)
    .eq('panel_clients.status', 'active')
    .limit(200)

  if (error) throw error
  if (!rows?.length) return { clients: 0, stepsSent: 0, skippedOutsideHours: false }

  const breaker = new FollowupCircuitBreaker()
  let totalSent = 0

  for (const row of rows) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config)
      ? row.panel_whatsapp_config[0]
      : row.panel_whatsapp_config

    if (!whatsappConfig || !isWhatsAppConnected(whatsappConfig as PanelWhatsAppConfig)) {
      logFollowupSkip('lead', 'sem_whatsapp_config', { clientId: row.client_id as string })
      continue
    }

    try {
      totalSent += await processClient(
        {
          clientId: row.client_id as string,
          botConfig: row as PanelBotConfig,
          whatsappConfig: whatsappConfig as PanelWhatsAppConfig,
        },
        breaker
      )
    } catch (error) {
      console.error(`[Followup Lead] Erro para client=${row.client_id}:`, error)
    }
  }

  return { clients: rows.length, stepsSent: totalSent, skippedOutsideHours: false }
}
