// Shared follow-up utilities: dynamic step config resolution, unified message
// dispatch (with Desk visibility + delivery tracking), circuit breaker, and
// structured logging.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import type {
  PanelBotConfig,
  PanelWhatsAppConfig,
  FollowupStepConfig,
  AgendadoFollowupStepConfig,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Default step definitions (frozen copies of the old hardcoded constants)
// ---------------------------------------------------------------------------

const DEFAULT_LEAD_STEPS: FollowupStepConfig[] = [
  { step_key: 'lead_D1', label: 'D+1', min_hours: 12, max_hours: 36, template: 'Ola {patient_name}, tudo bem? Posso te ajudar a concluir seu agendamento com {professional_name}?', enabled: true },
  { step_key: 'lead_D2', label: 'D+2', min_hours: 36, max_hours: 60, template: 'Oi {patient_name}, sigo por aqui para ajudar no agendamento com {professional_name}. Quer que eu te sugira horarios?', enabled: true },
  { step_key: 'lead_D3', label: 'D+3', min_hours: 60, max_hours: 84, template: 'Ola {patient_name}, passando para te lembrar que consigo te ajudar a marcar sua consulta quando preferir.', enabled: true },
  { step_key: 'lead_D5', label: 'D+5', min_hours: 108, max_hours: 132, template: 'Oi {patient_name}, ainda quer seguir com o atendimento? Posso te enviar opcoes de horario.', enabled: true },
  { step_key: 'lead_D7', label: 'D+7', min_hours: 156, max_hours: 180, template: 'Ola {patient_name}, este e meu ultimo lembrete. Se quiser, retomo seu agendamento agora mesmo.', enabled: true },
]

const DEFAULT_ATENDIMENTO_STEPS: FollowupStepConfig[] = [
  { step_key: 'atendimento_D1', label: 'D+1', min_hours: 12, max_hours: 36, template: 'Ola {patient_name}, recebi sua mensagem! Estou verificando e ja te respondo. Obrigado pela paciencia.', enabled: true },
  { step_key: 'atendimento_D2', label: 'D+2', min_hours: 36, max_hours: 60, template: 'Oi {patient_name}, desculpe a demora. Ainda estou cuidando da sua solicitacao. Posso te ajudar com algo mais?', enabled: true },
  { step_key: 'atendimento_D4', label: 'D+4', min_hours: 84, max_hours: 108, template: 'Ola {patient_name}, passando para verificar se ainda precisa de ajuda. Estou a disposicao!', enabled: true },
  { step_key: 'atendimento_D7', label: 'D+7', min_hours: 156, max_hours: 180, template: 'Oi {patient_name}, faz alguns dias que nao conseguimos dar sequencia. Quer que eu retome seu atendimento?', enabled: true },
  { step_key: 'atendimento_D10', label: 'D+10', min_hours: 228, max_hours: 252, template: 'Ola {patient_name}, este e meu ultimo lembrete. Se precisar de algo, e so me chamar que retomo na hora.', enabled: true },
]

const DEFAULT_AGENDADO_STEPS: AgendadoFollowupStepConfig[] = [
  { step_key: 'agendado_D-2_12h', label: 'D-2 (12h)', min_hours_before: 46, max_hours_before: 50, template: 'Ola {patient_name}! Sua consulta com {professional_name} esta marcada para {day_of_week}, {date} as {time}. Podemos confirmar sua presenca?', enabled: true },
  { step_key: 'agendado_-3h', label: '-3h', min_hours_before: 2.5, max_hours_before: 3.5, template: 'Oi {patient_name}, lembrete: sua consulta com {professional_name} e hoje as {time}. Nos vemos em breve!', enabled: true },
  { step_key: 'agendado_-5min', label: '-5min', min_hours_before: 0.05, max_hours_before: 0.12, template: 'Ola {patient_name}, sua consulta comeca em instantes! {meet_link}', enabled: true },
]

// Legacy template field mapping for fallback when JSONB is null.
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

// ---------------------------------------------------------------------------
// resolveStepConfig — reads JSONB or falls back to legacy + hardcoded defaults
// ---------------------------------------------------------------------------

export function resolveLeadSteps(config: PanelBotConfig): FollowupStepConfig[] {
  if (Array.isArray(config.lead_followup_steps) && config.lead_followup_steps.length > 0) {
    return config.lead_followup_steps.filter((s) => s.enabled)
  }
  return DEFAULT_LEAD_STEPS.map((step) => {
    const legacyField = LEGACY_LEAD_FIELDS[step.step_key]
    const legacyTemplate = legacyField ? (config[legacyField] as string | null) : null
    return { ...step, template: legacyTemplate?.trim() || step.template }
  })
}

export function resolveAtendimentoSteps(config: PanelBotConfig): FollowupStepConfig[] {
  if (Array.isArray(config.atendimento_followup_steps) && config.atendimento_followup_steps.length > 0) {
    return config.atendimento_followup_steps.filter((s) => s.enabled)
  }
  return DEFAULT_ATENDIMENTO_STEPS.map((step) => {
    const legacyField = LEGACY_ATENDIMENTO_FIELDS[step.step_key]
    const legacyTemplate = legacyField ? (config[legacyField] as string | null) : null
    return { ...step, template: legacyTemplate?.trim() || step.template }
  })
}

export function resolveAgendadoSteps(config: PanelBotConfig): AgendadoFollowupStepConfig[] {
  if (Array.isArray(config.agendado_followup_steps) && config.agendado_followup_steps.length > 0) {
    return config.agendado_followup_steps.filter((s) => s.enabled)
  }
  return DEFAULT_AGENDADO_STEPS.map((step) => {
    const legacyField = LEGACY_AGENDADO_FIELDS[step.step_key]
    const legacyTemplate = legacyField ? (config[legacyField] as string | null) : null
    return { ...step, template: legacyTemplate?.trim() || step.template }
  })
}

// Re-export defaults for use by the config UI when building initial state.
export { DEFAULT_LEAD_STEPS, DEFAULT_ATENDIMENTO_STEPS, DEFAULT_AGENDADO_STEPS }

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

// ---------------------------------------------------------------------------
// Unified follow-up message dispatch
// ---------------------------------------------------------------------------

export type CadenceType = 'lead' | 'atendimento' | 'agendado'

export interface SendFollowupParams {
  clientId: string
  conversationId: string
  contactId: string
  recipient: string
  instanceName: string
  cadenceType: CadenceType
  stepKey: string
  message: string
}

/**
 * Sends a follow-up message via Evolution, inserts into `messages` (Desk visibility),
 * logs to `followup_logs` and `followup_cadence_steps` (idempotency), and updates
 * the conversation's followup state.
 *
 * Returns true if the message was sent (new step). Returns false if the step was
 * already sent (idempotency duplicate). Throws on API or DB errors.
 */
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

  // 1. Idempotency guard
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
  if (!insertedStep?.id) return false // Already sent

  try {
    // 2. Send via Evolution API
    const evolutionMessageId = await sendTextMessage(instanceName, recipient, message)

    // 3. Update idempotency record with evolution_message_id
    if (evolutionMessageId) {
      await supabase
        .from('followup_cadence_steps')
        .update({ evolution_message_id: evolutionMessageId })
        .eq('id', insertedStep.id)
    }

    // 4. Insert into messages table (Desk visibility + delivery tracking)
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

    // 5. Audit log
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

    // 6. Update conversation
    await supabase
      .from('conversations')
      .update({
        followup_cadence: cadenceType,
        last_followup_at: sentAt,
      })
      .eq('id', conversationId)

    return true
  } catch (error) {
    // Remove idempotency reservation to allow retry on next cron cycle
    await supabase.from('followup_cadence_steps').delete().eq('id', insertedStep.id)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker (in-memory, per cron cycle)
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
      message: `Evolution API: ${this.threshold} falhas consecutivas — follow-ups pausados para este cliente neste ciclo.`,
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
  return (
    !!whatsappConfig.evolution_instance_name &&
    whatsappConfig.connection_status === 'open'
  )
}

// ---------------------------------------------------------------------------
// Reconciliation: fix orphaned steps where Evolution sent but messages INSERT failed
// ---------------------------------------------------------------------------

export async function reconcileOrphanedSteps(): Promise<number> {
  const supabase = createAdminClient()

  // Find steps that have evolution_message_id but no matching row in messages
  const { data: orphans, error } = await supabase
    .from('followup_cadence_steps')
    .select('id, conversation_id, cadence_type, step_key, message_sent, sent_at, evolution_message_id')
    .not('evolution_message_id', 'is', null)
    .limit(100)

  if (error || !orphans || orphans.length === 0) return 0

  let reconciled = 0

  for (const step of orphans) {
    // Check if a matching message already exists
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('evolution_message_id', step.evolution_message_id!)
      .maybeSingle()

    if (existing) continue // Message exists, not orphaned

    // Also check by conversation_id + from_who + approximate time (within 5 seconds)
    const sentAt = new Date(step.sent_at).getTime()
    const { data: nearMatch } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', step.conversation_id)
      .eq('from_who', 'followup')
      .gte('created_at', new Date(sentAt - 5000).toISOString())
      .lte('created_at', new Date(sentAt + 5000).toISOString())
      .maybeSingle()

    if (nearMatch) continue // Close enough match exists

    // Resolve client_id from conversation
    const { data: conv } = await supabase
      .from('conversations')
      .select('client_id')
      .eq('id', step.conversation_id)
      .maybeSingle()

    // Re-insert the missing message
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
      console.log(`[followup/reconcile] Repaired orphaned step ${step.id} (conv=${step.conversation_id}, step=${step.step_key})`)
    } else {
      console.error(`[followup/reconcile] Failed to repair step ${step.id}:`, insertError.message)
    }
  }

  if (reconciled > 0) {
    console.log(`[followup/reconcile] Reconciled ${reconciled} orphaned steps`)
  }

  return reconciled
}
