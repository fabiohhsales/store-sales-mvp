// Pipeline de follow-up para conversas "Em Atendimento":
// Contato foi o ultimo a falar → bot nao respondeu → cadencia de reengajamento.
// Steps: D+1, D+2, D+4, D+7, D+10 apos ultima mensagem recebida.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { isWithinBusinessHours } from '@/lib/followup/confirmations'
import { DEFAULT_STAGE_LABELS, normalizeStageSlug } from '@/lib/bot/stage-labels'
import type { PanelBotConfig, PanelWhatsAppConfig } from '@/types/database'

const DEFAULT_STEP_TEMPLATES = {
  atendimento_D1: 'Ola {patient_name}, recebi sua mensagem! Estou verificando e ja te respondo. Obrigado pela paciencia.',
  atendimento_D2: 'Oi {patient_name}, desculpe a demora. Ainda estou cuidando da sua solicitacao. Posso te ajudar com algo mais?',
  atendimento_D4: 'Ola {patient_name}, passando para verificar se ainda precisa de ajuda. Estou a disposicao!',
  atendimento_D7: 'Oi {patient_name}, faz alguns dias que nao conseguimos dar sequencia. Quer que eu retome seu atendimento?',
  atendimento_D10: 'Ola {patient_name}, este e meu ultimo lembrete. Se precisar de algo, e so me chamar que retomo na hora.',
} as const

type AtendimentoStepKey = keyof typeof DEFAULT_STEP_TEMPLATES

type AtendimentoStepConfig = {
  stepKey: AtendimentoStepKey
  minHours: number
  maxHours: number
  templateField: keyof Pick<
    PanelBotConfig,
    | 'atendimento_followup_msg_d1'
    | 'atendimento_followup_msg_d2'
    | 'atendimento_followup_msg_d4'
    | 'atendimento_followup_msg_d7'
    | 'atendimento_followup_msg_d10'
  >
}

const ATENDIMENTO_STEPS: AtendimentoStepConfig[] = [
  { stepKey: 'atendimento_D1', minHours: 12, maxHours: 36, templateField: 'atendimento_followup_msg_d1' },
  { stepKey: 'atendimento_D2', minHours: 36, maxHours: 60, templateField: 'atendimento_followup_msg_d2' },
  { stepKey: 'atendimento_D4', minHours: 84, maxHours: 108, templateField: 'atendimento_followup_msg_d4' },
  { stepKey: 'atendimento_D7', minHours: 156, maxHours: 180, templateField: 'atendimento_followup_msg_d7' },
  { stepKey: 'atendimento_D10', minHours: 228, maxHours: 252, templateField: 'atendimento_followup_msg_d10' },
]

interface AtendimentoConversation {
  id: string
  contact_id: string | null
  status: 'pending' | 'open' | 'resolved' | null
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

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

function resolveAtendimentoStepKey(lastIncomingAt: string): AtendimentoStepKey | null {
  const now = Date.now()
  const elapsedHours = (now - new Date(lastIncomingAt).getTime()) / (1000 * 60 * 60)

  const match = ATENDIMENTO_STEPS.find(
    (step) => elapsedHours >= step.minHours && elapsedHours < step.maxHours
  )

  return match?.stepKey ?? null
}

function getTemplateForStep(config: PanelBotConfig, stepKey: AtendimentoStepKey): string {
  const fieldByStep: Record<AtendimentoStepKey, AtendimentoStepConfig['templateField']> = {
    atendimento_D1: 'atendimento_followup_msg_d1',
    atendimento_D2: 'atendimento_followup_msg_d2',
    atendimento_D4: 'atendimento_followup_msg_d4',
    atendimento_D7: 'atendimento_followup_msg_d7',
    atendimento_D10: 'atendimento_followup_msg_d10',
  }

  const field = fieldByStep[stepKey]
  const customTemplate = config[field]
  return customTemplate?.trim() ? customTemplate : DEFAULT_STEP_TEMPLATES[stepKey]
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
    if (labels.some((label) => configuredAtendimento.has(label))) {
      return true
    }

    return conversation.followup_cadence === 'atendimento'
  }

  const hasAtendimentoLabel = labels.some((label) => DEFAULT_ATENDIMENTO_LABELS.has(label))
  const hasNonAtendimentoLabel = labels.some((label) => DEFAULT_NON_ATENDIMENTO_LABELS.has(label))

  if (hasAtendimentoLabel) {
    return true
  }

  if (hasNonAtendimentoLabel) {
    return false
  }

  return conversation.followup_cadence === 'atendimento'
}

async function queryAtendimentoConversations(
  clientId: string,
  botConfig: PanelBotConfig
): Promise<AtendimentoConversation[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_id, status, labels, followup_cadence, last_incoming_at, last_outgoing_at')
    .eq('client_id', clientId)
    .not('last_incoming_at', 'is', null)

  if (error) {
    throw error
  }

  const conversations = (data ?? []) as AtendimentoConversation[]

  return conversations.filter((conversation) => {
    if (conversation.status === 'resolved') {
      return false
    }

    if (!isAtendimentoStage(conversation, botConfig)) {
      return false
    }

    if (!conversation.last_incoming_at) {
      return false
    }

    // Contato falou por ultimo: incoming > outgoing (ou outgoing nulo)
    if (!conversation.last_outgoing_at) {
      return true
    }

    return new Date(conversation.last_incoming_at).getTime() > new Date(conversation.last_outgoing_at).getTime()
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

async function sendAtendimentoStep(
  ctx: ClientFollowupContext,
  conversation: AtendimentoConversation,
  contact: ContactRow,
  stepKey: AtendimentoStepKey
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

  // Reserva idempotente: UNIQUE(conversation_id, cadence_type, step_key)
  const { data: insertedStep, error: insertError } = await supabase
    .from('followup_cadence_steps')
    .upsert(
      {
        conversation_id: conversation.id,
        cadence_type: 'atendimento',
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

  // Ja enviado anteriormente → skip
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
        followup_cadence: 'atendimento',
        last_followup_at: sentAt,
      })
      .eq('id', conversation.id)

    return true
  } catch (error) {
    // Remove reserva para permitir retry no proximo ciclo
    await supabase.from('followup_cadence_steps').delete().eq('id', insertedStep.id)
    throw error
  }
}

async function processClient(ctx: ClientFollowupContext): Promise<number> {
  // Verifica horário comercial no timezone do cliente
  if (!isWithinBusinessHours(ctx.botConfig.timezone ?? 'America/Sao_Paulo')) return 0

  const conversations = await queryAtendimentoConversations(ctx.clientId, ctx.botConfig)
  if (!conversations.length) {
    return 0
  }

  const scheduledConversationIds = await queryConversationsWithScheduledAppointment(
    conversations.map((conversation) => conversation.id)
  )

  const candidates = conversations.filter(
    (conversation) => !scheduledConversationIds.has(conversation.id)
  )

  if (!candidates.length) {
    return 0
  }

  const contactsMap = await queryContacts(
    candidates
      .map((conversation) => conversation.contact_id)
      .filter(Boolean) as string[]
  )

  let sentCount = 0

  for (const conversation of candidates) {
    if (!conversation.last_incoming_at || !conversation.contact_id) {
      continue
    }

    const stepKey = resolveAtendimentoStepKey(conversation.last_incoming_at)
    if (!stepKey) {
      continue
    }

    const contact = contactsMap.get(conversation.contact_id)
    if (!contact) {
      continue
    }

    const wasSent = await sendAtendimentoStep(ctx, conversation, contact, stepKey)
    if (wasSent) {
      sentCount++
    }
  }

  return sentCount
}

export async function runAtendimentoCadencePipeline(): Promise<AtendimentoCadenceSummary> {
  // Sem check global — cada cliente é verificado no seu próprio timezone dentro de processClient()
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('atendimento_followup_enabled', true)
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
      continue
    }

    try {
      totalSent += await processClient({
        clientId: row.client_id as string,
        botConfig: row as PanelBotConfig,
        whatsappConfig: whatsappConfig as PanelWhatsAppConfig,
      })
    } catch (error) {
      console.error(`[Followup Atendimento] Erro para client=${row.client_id}:`, error)
    }
  }

  return {
    clients: rows.length,
    stepsSent: totalSent,
    skippedOutsideHours: false,
  }
}
