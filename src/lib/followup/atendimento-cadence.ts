// Pipeline de follow-up para conversas "Em Atendimento":
// Contato foi o ultimo a falar → bot nao respondeu → cadencia de reengajamento.
// Steps dinamicos via JSONB ou fallback para defaults hardcoded.

import { createAdminClient } from '@/lib/supabase/admin'
import { isWithinWorkingHours, logFollowupSkip } from '@/lib/followup/business-hours'
import { DEFAULT_STAGE_LABELS, normalizeStageSlug } from '@/lib/bot/stage-labels'
import {
  resolveAtendimentoSteps,
  renderTemplate,
  sendFollowupMessage,
  logFollowupEvent,
  FollowupCircuitBreaker,
  isWhatsAppConnected,
} from '@/lib/followup/shared'
import type { PanelBotConfig, PanelWhatsAppConfig, FollowupStepConfig } from '@/types/database'
import { upsertConversationFollowupState } from './state'
import { recordFollowupSent, recordFollowupSkipped } from './events'

interface AtendimentoConversation {
  id: string
  contact_id: string | null
  status: 'pending' | 'open' | 'resolved' | null
  stage: string | null
  labels: string[] | null
  followup_cadence: string | null
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

export interface AtendimentoCadenceSummary {
  clients: number
  stepsSent: number
  skippedOutsideHours: boolean
}

function resolveAtendimentoStepKey(
  lastIncomingAt: string,
  steps: FollowupStepConfig[]
): { stepKey: string; template: string } | null {
  const elapsedHours = (Date.now() - new Date(lastIncomingAt).getTime()) / (1000 * 60 * 60)
  const match = steps.find((step) => elapsedHours >= step.min_hours && elapsedHours < step.max_hours)
  return match ? { stepKey: match.step_key, template: match.template } : null
}

// Labels derivados de DEFAULT_STAGE_LABELS — fonte única de verdade
const DEFAULT_ATENDIMENTO_LABELS = new Set(
  DEFAULT_STAGE_LABELS
    .filter((l) => l.followup_cadence === 'atendimento')
    .map((l) => normalizeStageSlug(l.slug))
)

const DEFAULT_NON_ATENDIMENTO_LABELS = new Set(
  DEFAULT_STAGE_LABELS
    .filter((l) => l.followup_cadence !== null && l.followup_cadence !== 'atendimento')
    .map((l) => normalizeStageSlug(l.slug))
)

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

function isAtendimentoStage(conversation: AtendimentoConversation, botConfig: PanelBotConfig): boolean {
  const labels = (conversation.labels ?? []).map(normalizeLabel)

  const configuredAtendimento = new Set(
    (botConfig.stage_labels ?? [])
      .filter((item) => item.followup_cadence === 'atendimento')
      .map((item) => normalizeLabel(item.slug))
  )

  const hasConfiguredCadence = configuredAtendimento.size > 0

  if (hasConfiguredCadence) {
    if (labels.some((label) => configuredAtendimento.has(label))) return true
    return conversation.followup_cadence === 'atendimento'
  }

  const hasAtendimentoLabel = labels.some((label) => DEFAULT_ATENDIMENTO_LABELS.has(label))
  const hasNonAtendimentoLabel = labels.some((label) => DEFAULT_NON_ATENDIMENTO_LABELS.has(label))

  if (hasAtendimentoLabel) return true
  if (hasNonAtendimentoLabel) return false

  return conversation.followup_cadence === 'atendimento'
}

async function queryAtendimentoConversations(
  clientId: string,
  botConfig: PanelBotConfig
): Promise<AtendimentoConversation[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_id, status, stage, labels, followup_cadence, last_incoming_at, last_outgoing_at')
    .eq('client_id', clientId)
    .neq('status', 'resolved')
    .not('last_incoming_at', 'is', null)
    .limit(500)

  if (error) throw error

  // Filtrar conversas suprimidas para atendimento
  const suppressed = await import('./shared').then(m => m.getSuppressedConversations(clientId, 'atendimento'));

  return ((data ?? []) as AtendimentoConversation[]).filter((conversation) => {
    if (suppressed.has(conversation.id)) return false;
    if (!isAtendimentoStage(conversation, botConfig)) return false;
    if (!conversation.last_incoming_at) return false;
    if (!conversation.last_outgoing_at) return true;
    return new Date(conversation.last_incoming_at).getTime() > new Date(conversation.last_outgoing_at).getTime();
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
    logFollowupSkip('atendimento', 'fora_do_horario', { clientId: ctx.clientId })
    return 0
  }

  const steps = resolveAtendimentoSteps(ctx.botConfig)
  if (!steps.length) {
    logFollowupEvent('atendimento', 'skipped', { clientId: ctx.clientId, reason: 'no_enabled_steps' })
    return 0
  }

  const conversations = await queryAtendimentoConversations(ctx.clientId, ctx.botConfig)
  if (!conversations.length) {
    logFollowupSkip('atendimento', 'sem_conversas', { clientId: ctx.clientId })
    return 0
  }

  const scheduledConversationIds = await queryConversationsWithScheduledAppointment(
    conversations.map((c) => c.id)
  )

  const candidates = conversations.filter((c) => !scheduledConversationIds.has(c.id))
  if (!candidates.length) {
    logFollowupSkip('atendimento', 'sem_candidatos_pos_filtro', { clientId: ctx.clientId })
    return 0
  }

  const contactsMap = await queryContacts(
    candidates.map((c) => c.contact_id).filter(Boolean) as string[]
  )

  let sentCount = 0
  const instanceName = ctx.whatsappConfig.evolution_instance_name

  for (const conversation of candidates) {
    if (breaker.isOpen(ctx.clientId)) {
      logFollowupEvent('atendimento', 'circuit_open', { clientId: ctx.clientId })
      break
    }

    if (conversation.stage === 'in_service' || conversation.stage === 'awaiting_human') {
      logFollowupSkip('atendimento', 'em_atendimento_humano', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      
      // Fase 1: Registrar evento de skip
      await recordFollowupSkipped({
        clientId: ctx.clientId,
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        cadenceType: 'atendimento',
        reasonCode: 'em_atendimento_humano',
        reasonLabel: 'Conversa em atendimento humano'
      })
      
      continue
    }

    if (!conversation.last_incoming_at || !conversation.contact_id) {
      logFollowupSkip('atendimento', 'sem_contato_ou_last_incoming', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      continue
    }

    const resolved = resolveAtendimentoStepKey(conversation.last_incoming_at, steps)
    if (!resolved) {
      logFollowupSkip('atendimento', 'sem_step_elegivel', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      
      // Fase 1: Registrar evento de skip
      await recordFollowupSkipped({
        clientId: ctx.clientId,
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        cadenceType: 'atendimento',
        reasonCode: 'sem_step_elegivel',
        reasonLabel: 'Nenhum step elegível no momento'
      })
      
      continue
    }

    const contact = contactsMap.get(conversation.contact_id)
    if (!contact) {
      logFollowupSkip('atendimento', 'contato_nao_encontrado', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      
      // Fase 1: Registrar evento de skip
      await recordFollowupSkipped({
        clientId: ctx.clientId,
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        cadenceType: 'atendimento',
        reasonCode: 'contato_nao_encontrado',
        reasonLabel: 'Contato não encontrado'
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
        cadenceType: 'atendimento',
        stepKey: resolved.stepKey,
        message,
      })
      if (wasSent) {
        sentCount++
        breaker.recordSuccess(ctx.clientId)
        
        // Fase 1: Registrar evento de envio + atualizar estado
        await recordFollowupSent({
          clientId: ctx.clientId,
          conversationId: conversation.id,
          contactId: conversation.contact_id,
          cadenceType: 'atendimento',
          stepKey: resolved.stepKey,
          message
        })
        
        await upsertConversationFollowupState({
          client_id: ctx.clientId,
          conversation_id: conversation.id,
          contact_id: conversation.contact_id,
          state: 'active',
          cadence_type: 'atendimento',
          current_step_key: resolved.stepKey,
          current_step_label: `Atendimento ${resolved.stepKey}`,
          total_attempts: 1,
          last_sent_at: new Date().toISOString(),
          last_evaluated_at: new Date().toISOString()
        })
      }
    } catch (error) {
      breaker.recordFailure(ctx.clientId)
      console.error(`[Followup Atendimento] Erro para conversation=${conversation.id}:`, error)
    }
  }

  return sentCount
}

export async function runAtendimentoCadencePipeline(
  targetClientId?: string
): Promise<AtendimentoCadenceSummary> {
  const supabase = createAdminClient()

  let query = supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('atendimento_followup_enabled', true)
    .eq('panel_clients.status', 'active')
    .limit(200)

  if (targetClientId) {
    query = query.eq('client_id', targetClientId)
  }

  const { data: rows, error } = await query

  if (error) throw error
  if (!rows?.length) return { clients: 0, stepsSent: 0, skippedOutsideHours: false }

  const breaker = new FollowupCircuitBreaker()
  let totalSent = 0

  for (const row of rows) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config)
      ? row.panel_whatsapp_config[0]
      : row.panel_whatsapp_config

    if (!whatsappConfig || !isWhatsAppConnected(whatsappConfig as PanelWhatsAppConfig)) {
      logFollowupSkip('atendimento', 'sem_whatsapp_config', { clientId: row.client_id as string })
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
      console.error(`[Followup Atendimento] Erro para client=${row.client_id}:`, error)
    }
  }

  return { clients: rows.length, stepsSent: totalSent, skippedOutsideHours: false }
}
