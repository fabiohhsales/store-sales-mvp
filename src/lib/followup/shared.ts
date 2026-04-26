import { sendTextMessage } from '@/lib/api/evolution'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  AgendadoFollowupStepConfig,
  FollowupStepConfig,
  PanelBotConfig,
  PanelWhatsAppConfig,
} from '@/types/database'

export type CadenceType = 'lead' | 'atendimento' | 'agendado'

// ---------------------------------------------------------------------------
// Cadence suppression
// ---------------------------------------------------------------------------

export async function getSuppressedConversations(
  clientId: string,
  cadenceType: CadenceType
): Promise<Set<string>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('followup_cadence_suppressions')
    .select('conversation_id')
    .eq('client_id', clientId)
    .eq('cadence_type', cadenceType)
    .is('released_at', null)

  if (error) throw error

  return new Set(
    (data ?? [])
      .map((row: { conversation_id: string | null }) => row.conversation_id)
      .filter(Boolean) as string[]
  )
}

// ---------------------------------------------------------------------------
// Default step definitions
// ---------------------------------------------------------------------------

const DEFAULT_LEAD_STEPS: FollowupStepConfig[] = [
  {
    step_key: 'lead_D1',
    label: 'D+1',
    min_hours: 12,
    max_hours: 36,
    template:
      'Ola {patient_name}, tudo bem? Posso te ajudar a concluir seu agendamento com {professional_name}?',
    enabled: true,
  },
  {
    step_key: 'lead_D2',
    label: 'D+2',
    min_hours: 36,
    max_hours: 60,
    template:
      'Oi {patient_name}, sigo por aqui para ajudar no agendamento com {professional_name}. Quer que eu te sugira horarios?',
    enabled: true,
  },
  {
    step_key: 'lead_D3',
    label: 'D+3',
    min_hours: 60,
    max_hours: 84,
    template:
      'Ola {patient_name}, passando para te lembrar que consigo te ajudar a marcar sua consulta quando preferir.',
    enabled: true,
  },
  {
    step_key: 'lead_D5',
    label: 'D+5',
    min_hours: 108,
    max_hours: 132,
    template:
      'Oi {patient_name}, ainda quer seguir com o atendimento? Posso te enviar opcoes de horario.',
    enabled: true,
  },
  {
    step_key: 'lead_D7',
    label: 'D+7',
    min_hours: 156,
    max_hours: 180,
    template:
      'Ola {patient_name}, este e meu ultimo lembrete. Se quiser, retomo seu agendamento agora mesmo.',
    enabled: true,
  },
]

const DEFAULT_ATENDIMENTO_STEPS: FollowupStepConfig[] = [
  {
    step_key: 'atendimento_D1',
    label: 'D+1',
    min_hours: 12,
    max_hours: 36,
    template:
      'Ola {patient_name}, recebi sua mensagem! Estou verificando e ja te respondo. Obrigado pela paciencia.',
    enabled: true,
  },
  {
    step_key: 'atendimento_D2',
    label: 'D+2',
    min_hours: 36,
    max_hours: 60,
    template:
      'Oi {patient_name}, desculpe a demora. Ainda estou cuidando da sua solicitacao. Posso te ajudar com algo mais?',
    enabled: true,
  },
  {
    step_key: 'atendimento_D4',
    label: 'D+4',
    min_hours: 84,
    max_hours: 108,
    template:
      'Ola {patient_name}, passando para verificar se ainda precisa de ajuda. Estou a disposicao!',
    enabled: true,
  },
  {
    step_key: 'atendimento_D7',
    label: 'D+7',
    min_hours: 156,
    max_hours: 180,
    template:
      'Oi {patient_name}, faz alguns dias que nao conseguimos dar sequencia. Quer que eu retome seu atendimento?',
    enabled: true,
  },
  {
    step_key: 'atendimento_D10',
    label: 'D+10',
    min_hours: 228,
    max_hours: 252,
    template:
      'Ola {patient_name}, este e meu ultimo lembrete. Se precisar de algo, e so me chamar que retomo na hora.',
    enabled: true,
  },
]

const DEFAULT_AGENDADO_STEPS: AgendadoFollowupStepConfig[] = [
  {
    step_key: 'agendado_D-2_12h',
    label: 'D-2 (12h)',
    min_hours_before: 46,
    max_hours_before: 50,
    template:
      'Ola {patient_name}! Sua consulta com {professional_name} esta marcada para {day_of_week}, {date} as {time}. Podemos confirmar sua presenca?',
    enabled: true,
  },
  {
    step_key: 'agendado_-3h',
    label: '-3h',
    min_hours_before: 2.5,
    max_hours_before: 3.5,
    template:
      'Oi {patient_name}, lembrete: sua consulta com {professional_name} e hoje as {time}. Nos vemos em breve!',
    enabled: true,
  },
  {
    step_key: 'agendado_-5min',
    label: '-5min',
    min_hours_before: 0.05,
    max_hours_before: 0.12,
    template: 'Ola {patient_name}, sua consulta comeca em instantes! {meet_link}',
    enabled: true,
  },
]

const LEGACY_LEAD_FIELDS: Record<string, keyof PanelBotConfig> = {
  lead_D1: 'lead_followup_msg_d1',
  lead_D2: 'lead_followup_msg_d2',
  lead_D3: 'lead_followup_msg_d3',
  lead_D5: 'lead_followup_msg_d5',
  lead_D7: 'lead_followup_msg_d7',
}

const LEGACY_ATENDIMENTO_FIELDS: Record<string, keyof PanelBotConfig> = {
  atendimento_D1: 'atendimento_followup_msg_d1',
  atendimento_D2: 'atendimento_followup_msg_d2',
  atendimento_D4: 'atendimento_followup_msg_d4',
  atendimento_D7: 'atendimento_followup_msg_d7',
  atendimento_D10: 'atendimento_followup_msg_d10',
}

const LEGACY_AGENDADO_FIELDS: Record<string, keyof PanelBotConfig> = {
  'agendado_D-2_12h': 'agendado_followup_msg_d2',
  'agendado_-3h': 'agendado_followup_msg_minus3h',
  'agendado_-5min': 'agendado_followup_msg_minus5min',
}

export function resolveLeadSteps(config: PanelBotConfig): FollowupStepConfig[] {
  if (Array.isArray(config.lead_followup_steps) && config.lead_followup_steps.length > 0) {
    return config.lead_followup_steps.filter((step) => step.enabled)
  }

  return DEFAULT_LEAD_STEPS.map((step) => {
    const legacyField = LEGACY_LEAD_FIELDS[step.step_key]
    const legacyTemplate = legacyField ? (config[legacyField] as string | null) : null
    return { ...step, template: legacyTemplate?.trim() || step.template }
  })
}

export function resolveAtendimentoSteps(config: PanelBotConfig): FollowupStepConfig[] {
  if (Array.isArray(config.atendimento_followup_steps) && config.atendimento_followup_steps.length > 0) {
    return config.atendimento_followup_steps.filter((step) => step.enabled)
  }

  return DEFAULT_ATENDIMENTO_STEPS.map((step) => {
    const legacyField = LEGACY_ATENDIMENTO_FIELDS[step.step_key]
    const legacyTemplate = legacyField ? (config[legacyField] as string | null) : null
    return { ...step, template: legacyTemplate?.trim() || step.template }
  })
}

export function resolveAgendadoSteps(config: PanelBotConfig): AgendadoFollowupStepConfig[] {
  if (Array.isArray(config.agendado_followup_steps) && config.agendado_followup_steps.length > 0) {
    return config.agendado_followup_steps.filter((step) => step.enabled)
  }

  return DEFAULT_AGENDADO_STEPS.map((step) => {
    const legacyField = LEGACY_AGENDADO_FIELDS[step.step_key]
    const legacyTemplate = legacyField ? (config[legacyField] as string | null) : null
    return { ...step, template: legacyTemplate?.trim() || step.template }
  })
}

export { DEFAULT_LEAD_STEPS, DEFAULT_ATENDIMENTO_STEPS, DEFAULT_AGENDADO_STEPS }

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface SendFollowupParams {
  clientId: string
  conversationId: string
  contactId: string | null
  recipient: string
  instanceName: string
  cadenceType: CadenceType
  stepKey: string
  message: string
}

export interface SendOperationalFollowupParams {
  clientId: string
  conversationId: string
  contactId: string | null
  recipient: string
  instanceName: string
  cadenceType: CadenceType
  message: string
  stepKey?: string | null
  logStepName?: string
}

export async function sendFollowupMessage(params: SendFollowupParams): Promise<boolean> {
  const {
    clientId,
    conversationId,
    contactId,
    recipient,
    instanceName,
    cadenceType,
    stepKey,
    message,
  } = params

  const supabase = createAdminClient()
  const sentAt = new Date().toISOString()

  const { data: insertedStep, error: insertError } = await supabase
    .from('followup_cadence_steps')
    .upsert(
      {
        conversation_id: conversationId,
        cadence_type: cadenceType,
        step_key: stepKey,
        message_sent: message,
        sent_at: sentAt,
      },
      { onConflict: 'conversation_id,cadence_type,step_key', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle()

  if (insertError) throw insertError
  if (!insertedStep?.id) return false

  try {
    const evolutionMessageId = await sendTextMessage(instanceName, recipient, message)

    if (evolutionMessageId) {
      await supabase
        .from('followup_cadence_steps')
        .update({ evolution_message_id: evolutionMessageId })
        .eq('id', insertedStep.id)
    }

    await supabase.from('messages').insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      client_id: clientId,
      content: message,
      content_type: 'text',
      sender_type: 'agent_bot',
      from_who: 'followup',
      evolution_message_id: evolutionMessageId,
      created_at: sentAt,
    })

    await supabase.from('followup_logs').insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      contact_id: contactId,
      workflow_name: 'panel_followup',
      step_name: stepKey,
      message_sent: message,
      sent_at: sentAt,
      evolution_message_id: evolutionMessageId,
    })

    await supabase
      .from('conversations')
      .update({
        followup_cadence: cadenceType,
        last_followup_at: sentAt,
        last_outgoing_at: sentAt,
        last_outgoing_by: 'ai',
      })
      .eq('id', conversationId)

    return true
  } catch (error) {
    await supabase.from('followup_cadence_steps').delete().eq('id', insertedStep.id)
    throw error
  }
}

export async function sendOperationalFollowupMessage(
  params: SendOperationalFollowupParams
): Promise<{ evolutionMessageId: string | null; sentAt: string }> {
  const {
    clientId,
    conversationId,
    contactId,
    recipient,
    instanceName,
    cadenceType,
    message,
    stepKey = null,
    logStepName = 'manual_send',
  } = params

  const supabase = createAdminClient()
  const sentAt = new Date().toISOString()
  const evolutionMessageId = await sendTextMessage(instanceName, recipient, message)

  if (stepKey) {
    const { error: stepError } = await supabase
      .from('followup_cadence_steps')
      .upsert(
        {
          conversation_id: conversationId,
          cadence_type: cadenceType,
          step_key: stepKey,
          message_sent: message,
          sent_at: sentAt,
          evolution_message_id: evolutionMessageId,
        },
        { onConflict: 'conversation_id,cadence_type,step_key', ignoreDuplicates: true }
      )

    if (stepError) throw stepError
  }

  const [{ error: messageError }, { error: logError }, { error: conversationError }] = await Promise.all([
    supabase.from('messages').insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      client_id: clientId,
      content: message,
      content_type: 'text',
      sender_type: 'agent_bot',
      from_who: 'followup',
      evolution_message_id: evolutionMessageId,
      created_at: sentAt,
    }),
    supabase.from('followup_logs').insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      contact_id: contactId,
      workflow_name: 'panel_followup',
      step_name: logStepName,
      message_sent: message,
      sent_at: sentAt,
      evolution_message_id: evolutionMessageId,
    }),
    supabase
      .from('conversations')
      .update({
        followup_cadence: cadenceType,
        last_followup_at: sentAt,
        last_outgoing_at: sentAt,
        last_outgoing_by: 'ai',
      })
      .eq('id', conversationId),
  ])

  if (messageError) throw messageError
  if (logError) throw logError
  if (conversationError) throw conversationError

  return { evolutionMessageId, sentAt }
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export class FollowupCircuitBreaker {
  private failures: Map<string, number> = new Map()
  private threshold: number

  constructor(threshold = 3) {
    this.threshold = threshold
  }

  isOpen(clientId: string): boolean {
    return (this.failures.get(clientId) ?? 0) >= this.threshold
  }

  recordFailure(clientId: string): void {
    const count = (this.failures.get(clientId) ?? 0) + 1
    this.failures.set(clientId, count)

    if (count === this.threshold) {
      this.persistAlert(clientId).catch((err) =>
        console.error(`[CircuitBreaker] Failed to persist alert for client=${clientId}:`, err)
      )
    }
  }

  recordSuccess(clientId: string): void {
    this.failures.delete(clientId)
  }

  private async persistAlert(clientId: string): Promise<void> {
    const supabase = createAdminClient()
    await supabase.from('followup_alerts').insert({
      client_id: clientId,
      cadence_type: 'all',
      alert_type: 'circuit_breaker',
      message: `Evolution API: ${this.threshold} falhas consecutivas - follow-ups pausados para este cliente neste ciclo.`,
      details: { threshold: this.threshold },
    })
  }
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

export type FollowupEvent = 'sent' | 'skipped' | 'error' | 'circuit_open'

export function logFollowupEvent(
  cadence: CadenceType | string,
  event: FollowupEvent,
  ctx: Record<string, unknown>
): void {
  console.log(`[Followup ${cadence}] ${event}`, JSON.stringify(ctx))
}

// ---------------------------------------------------------------------------
// WhatsApp connection gate
// ---------------------------------------------------------------------------

export function isWhatsAppConnected(whatsappConfig: PanelWhatsAppConfig): boolean {
  return !!whatsappConfig.evolution_instance_name && whatsappConfig.connection_status === 'open'
}

// ---------------------------------------------------------------------------
// Reconciliation: repair orphaned follow-up steps
// ---------------------------------------------------------------------------

export async function reconcileOrphanedSteps(): Promise<number> {
  const supabase = createAdminClient()

  const { data: orphans, error } = await supabase
    .from('followup_cadence_steps')
    .select('id, conversation_id, cadence_type, step_key, message_sent, sent_at, evolution_message_id')
    .not('evolution_message_id', 'is', null)
    .limit(100)

  if (error || !orphans || orphans.length === 0) return 0

  let reconciled = 0

  for (const step of orphans) {
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('evolution_message_id', step.evolution_message_id!)
      .maybeSingle()

    if (existing) continue

    const sentAt = new Date(step.sent_at).getTime()
    const { data: nearMatch } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', step.conversation_id)
      .eq('from_who', 'followup')
      .gte('created_at', new Date(sentAt - 5000).toISOString())
      .lte('created_at', new Date(sentAt + 5000).toISOString())
      .maybeSingle()

    if (nearMatch) continue

    const { data: conv } = await supabase
      .from('conversations')
      .select('client_id')
      .eq('id', step.conversation_id)
      .maybeSingle()

    const { error: insertError } = await supabase.from('messages').insert({
      id: crypto.randomUUID(),
      conversation_id: step.conversation_id,
      client_id: conv?.client_id ?? null,
      content: step.message_sent,
      content_type: 'text',
      sender_type: 'agent_bot',
      from_who: 'followup',
      evolution_message_id: step.evolution_message_id,
      created_at: step.sent_at,
    })

    if (!insertError) {
      reconciled++
      console.log(
        `[followup/reconcile] Repaired orphaned step ${step.id} (conv=${step.conversation_id}, step=${step.step_key})`
      )
    } else {
      console.error(`[followup/reconcile] Failed to repair step ${step.id}:`, insertError.message)
    }
  }

  if (reconciled > 0) {
    console.log(`[followup/reconcile] Reconciled ${reconciled} orphaned steps`)
  }

  return reconciled
}
