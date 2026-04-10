import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { isWithinWorkingHours, logFollowupSkip } from '@/lib/followup/business-hours'
import type { PanelBotConfig, PanelWhatsAppConfig } from '@/types/database'

const DEFAULT_STEP_TEMPLATES = {
  lead_D1: 'Ola {patient_name}, tudo bem? Posso te ajudar a concluir seu agendamento com {professional_name}?',
  lead_D2: 'Oi {patient_name}, sigo por aqui para ajudar no agendamento com {professional_name}. Quer que eu te sugira horarios?',
  lead_D3: 'Ola {patient_name}, passando para te lembrar que consigo te ajudar a marcar sua consulta quando preferir.',
  lead_D5: 'Oi {patient_name}, ainda quer seguir com o atendimento? Posso te enviar opcoes de horario.',
  lead_D7: 'Ola {patient_name}, este e meu ultimo lembrete. Se quiser, retomo seu agendamento agora mesmo.',
} as const

type LeadStepKey = keyof typeof DEFAULT_STEP_TEMPLATES

type LeadStepConfig = {
  stepKey: LeadStepKey
  minHours: number
  maxHours: number
  templateField: keyof Pick<
    PanelBotConfig,
    | 'lead_followup_msg_d1'
    | 'lead_followup_msg_d2'
    | 'lead_followup_msg_d3'
    | 'lead_followup_msg_d5'
    | 'lead_followup_msg_d7'
  >
}

const LEAD_STEPS: LeadStepConfig[] = [
  { stepKey: 'lead_D1', minHours: 12, maxHours: 36, templateField: 'lead_followup_msg_d1' },
  { stepKey: 'lead_D2', minHours: 36, maxHours: 60, templateField: 'lead_followup_msg_d2' },
  { stepKey: 'lead_D3', minHours: 60, maxHours: 84, templateField: 'lead_followup_msg_d3' },
  { stepKey: 'lead_D5', minHours: 108, maxHours: 132, templateField: 'lead_followup_msg_d5' },
  { stepKey: 'lead_D7', minHours: 156, maxHours: 180, templateField: 'lead_followup_msg_d7' },
]

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

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

function resolveLeadStepKey(lastOutgoingAt: string): LeadStepKey | null {
  const now = Date.now()
  const elapsedHours = (now - new Date(lastOutgoingAt).getTime()) / (1000 * 60 * 60)

  const match = LEAD_STEPS.find(
    (step) => elapsedHours >= step.minHours && elapsedHours < step.maxHours
  )

  return match?.stepKey ?? null
}

function getTemplateForStep(config: PanelBotConfig, stepKey: LeadStepKey): string {
  const fieldByStep: Record<LeadStepKey, LeadStepConfig['templateField']> = {
    lead_D1: 'lead_followup_msg_d1',
    lead_D2: 'lead_followup_msg_d2',
    lead_D3: 'lead_followup_msg_d3',
    lead_D5: 'lead_followup_msg_d5',
    lead_D7: 'lead_followup_msg_d7',
  }

  const field = fieldByStep[stepKey]
  const customTemplate = config[field]
  return customTemplate?.trim() ? customTemplate : DEFAULT_STEP_TEMPLATES[stepKey]
}

async function queryLeadConversations(clientId: string): Promise<LeadConversation[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_id, last_incoming_at, last_outgoing_at')
    .eq('client_id', clientId)
    .not('last_outgoing_at', 'is', null)

  if (error) {
    throw error
  }

  const conversations = (data ?? []) as LeadConversation[]

  return conversations.filter((conversation) => {
    if (!conversation.last_outgoing_at || !conversation.last_incoming_at) {
      return false
    }

    return new Date(conversation.last_incoming_at).getTime() < new Date(conversation.last_outgoing_at).getTime()
  })
}

async function queryConversationsWithScheduledAppointment(conversationIds: string[]): Promise<Set<string>> {
  if (!conversationIds.length) {
    return new Set()
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .select('conversation_id')
    .eq('status', 'scheduled')
    .gt('start_at', new Date().toISOString())
    .in('conversation_id', conversationIds)

  if (error) {
    throw error
  }

  const ids = (data ?? []).map((row: { conversation_id: string | null }) => row.conversation_id).filter(Boolean) as string[]
  return new Set(ids)
}

async function queryContacts(contactIds: string[]): Promise<Map<string, ContactRow>> {
  if (!contactIds.length) {
    return new Map()
  }

  const supabase = createAdminClient()
  const uniqueContactIds = [...new Set(contactIds)]

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', uniqueContactIds)

  if (error) {
    throw error
  }

  return new Map((data ?? []).map((contact: ContactRow) => [contact.id, contact]))
}

async function sendLeadStep(
  ctx: ClientFollowupContext,
  conversation: LeadConversation,
  contact: ContactRow,
  stepKey: LeadStepKey
): Promise<boolean> {
  const supabase = createAdminClient()
  const recipient = contact.identifier ?? contact.phone_number
  const instanceName = ctx.whatsappConfig.evolution_instance_name

  if (!recipient || !instanceName || !conversation.contact_id) {
    return false
  }

  const template = getTemplateForStep(ctx.botConfig, stepKey)
  const message = render(template, {
    patient_name: contact.name ?? 'Paciente',
    professional_name: ctx.botConfig.professional_name,
    business_name: ctx.botConfig.business_name ?? ctx.botConfig.professional_name,
  })

  const sentAt = new Date().toISOString()

  const { data: insertedStep, error: insertError } = await supabase
    .from('followup_cadence_steps')
    .upsert(
      {
        conversation_id: conversation.id,
        cadence_type: 'lead',
        step_key: stepKey,
        message_sent: message,
        sent_at: sentAt,
      },
      { onConflict: 'conversation_id,cadence_type,step_key', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle()

  if (insertError) {
    throw insertError
  }

  if (!insertedStep?.id) {
    return false
  }

  try {
    await sendTextMessage(instanceName, recipient, message)

    await supabase.from('followup_logs').insert({
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      workflow_name: 'panel_followup',
      step_name: stepKey,
      message_sent: message,
      sent_at: sentAt,
    })

    await supabase
      .from('conversations')
      .update({
        followup_cadence: 'lead',
        last_followup_at: sentAt,
      })
      .eq('id', conversation.id)

    return true
  } catch (error) {
    // Remove a reserva para permitir retry no proximo ciclo de cron.
    await supabase.from('followup_cadence_steps').delete().eq('id', insertedStep.id)
    throw error
  }
}

async function processClient(ctx: ClientFollowupContext): Promise<number> {
  // Verifica working_hours real do cliente (não janela fixa 8–17).
  if (!isWithinWorkingHours(ctx.botConfig.working_hours, ctx.botConfig.timezone ?? 'America/Sao_Paulo')) {
    logFollowupSkip('lead', 'fora_do_horario', { clientId: ctx.clientId })
    return 0
  }

  const conversations = await queryLeadConversations(ctx.clientId)
  if (!conversations.length) {
    logFollowupSkip('lead', 'sem_conversas', { clientId: ctx.clientId })
    return 0
  }

  const scheduledConversationIds = await queryConversationsWithScheduledAppointment(
    conversations.map((conversation) => conversation.id)
  )

  const candidates = conversations.filter(
    (conversation) => !scheduledConversationIds.has(conversation.id)
  )

  if (!candidates.length) {
    logFollowupSkip('lead', 'sem_candidatos_pos_filtro', { clientId: ctx.clientId })
    return 0
  }

  const contactsMap = await queryContacts(
    candidates
      .map((conversation) => conversation.contact_id)
      .filter(Boolean) as string[]
  )

  let sentCount = 0

  for (const conversation of candidates) {
    if (!conversation.last_outgoing_at || !conversation.contact_id) {
      logFollowupSkip('lead', 'sem_contato_ou_last_outgoing', {
        clientId: ctx.clientId,
        conversationId: conversation.id,
      })
      continue
    }

    const stepKey = resolveLeadStepKey(conversation.last_outgoing_at)
    if (!stepKey) {
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

    const wasSent = await sendLeadStep(ctx, conversation, contact, stepKey)
    if (wasSent) {
      sentCount++
    }
  }

  return sentCount
}

export async function runLeadCadencePipeline(): Promise<LeadCadenceSummary> {
  // Sem check global — cada cliente é verificado no seu próprio timezone dentro de processClient()
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('lead_followup_enabled', true)
    .eq('panel_clients.status', 'active')

  if (error) {
    throw error
  }

  if (!rows?.length) {
    return { clients: 0, stepsSent: 0, skippedOutsideHours: false }
  }

  let totalSent = 0

  for (const row of rows) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config)
      ? row.panel_whatsapp_config[0]
      : row.panel_whatsapp_config

    if (!whatsappConfig) {
      logFollowupSkip('lead', 'sem_whatsapp_config', { clientId: row.client_id as string })
      continue
    }

    try {
      totalSent += await processClient({
        clientId: row.client_id as string,
        botConfig: row as PanelBotConfig,
        whatsappConfig: whatsappConfig as PanelWhatsAppConfig,
      })
    } catch (error) {
      console.error(`[Followup Lead] Erro para client=${row.client_id}:`, error)
    }
  }

  return {
    clients: rows.length,
    stepsSent: totalSent,
    skippedOutsideHours: false,
  }
}
