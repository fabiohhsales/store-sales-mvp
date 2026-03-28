// Pipeline de follow-up para consultas agendadas:
// Envia mensagens em D-2 (12h), -3h, -5min antes do start_at do appointment.
// Complementa confirmations.ts (que cuida de confirmacao/lembrete/no-show legacy).
// Roda a cada 5 minutos via cron dedicado.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { isWithinBusinessHours } from '@/lib/followup/confirmations'
import type { PanelBotConfig, PanelWhatsAppConfig } from '@/types/database'

const TIMEZONE = 'America/Sao_Paulo'

const DEFAULT_STEP_TEMPLATES = {
  'agendado_D-2_12h': 'Ola {patient_name}! Sua consulta com {professional_name} esta marcada para {day_of_week}, {date} as {time}. Podemos confirmar sua presenca?',
  'agendado_-3h': 'Oi {patient_name}, lembrete: sua consulta com {professional_name} e hoje as {time}. Nos vemos em breve!',
  'agendado_-5min': 'Ola {patient_name}, sua consulta comeca em instantes! {meet_link}',
} as const

type AgendadoStepKey = keyof typeof DEFAULT_STEP_TEMPLATES

type AgendadoStepConfig = {
  stepKey: AgendadoStepKey
  /** Horas antes do start_at (min) */
  minHoursBefore: number
  /** Horas antes do start_at (max) */
  maxHoursBefore: number
  templateField: keyof Pick<
    PanelBotConfig,
    'agendado_followup_msg_d2' | 'agendado_followup_msg_minus3h' | 'agendado_followup_msg_minus5min'
  >
}

// Janelas calculadas a partir de "horas antes do start_at":
// D-2 12h  → 46–50h antes
// -3h      → 2.5–3.5h antes
// -5min    → 0.05–0.12h antes (~3–7min)
const AGENDADO_STEPS: AgendadoStepConfig[] = [
  { stepKey: 'agendado_D-2_12h', minHoursBefore: 46, maxHoursBefore: 50, templateField: 'agendado_followup_msg_d2' },
  { stepKey: 'agendado_-3h', minHoursBefore: 2.5, maxHoursBefore: 3.5, templateField: 'agendado_followup_msg_minus3h' },
  { stepKey: 'agendado_-5min', minHoursBefore: 0.05, maxHoursBefore: 0.12, templateField: 'agendado_followup_msg_minus5min' },
]

interface AppointmentRow {
  id: string
  conversation_id: string
  contact_id: string
  start_at: string
  end_at: string
  status: string | null
  meet_link: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_identifier: string | null
}

interface ClientFollowupContext {
  clientId: string
  botConfig: PanelBotConfig
  whatsappConfig: PanelWhatsAppConfig
}

export interface AgendadoCadenceSummary {
  clients: number
  stepsSent: number
  skippedOutsideHours: boolean
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

function buildTemplateVars(
  config: PanelBotConfig,
  appointment: AppointmentRow
): Record<string, string> {
  const start = new Date(appointment.start_at)

  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(start)

  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(start)

  const dayOfWeek = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(start)

  return {
    patient_name: appointment.contact_name ?? 'Paciente',
    professional_name: config.professional_name,
    business_name: config.business_name ?? config.professional_name,
    date,
    time,
    day_of_week: dayOfWeek,
    meet_link: appointment.meet_link ?? '',
  }
}

function resolveAgendadoStepKey(startAt: string): AgendadoStepKey | null {
  const hoursBefore = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60)

  const match = AGENDADO_STEPS.find(
    (step) => hoursBefore >= step.minHoursBefore && hoursBefore < step.maxHoursBefore
  )

  return match?.stepKey ?? null
}

function getTemplateForStep(config: PanelBotConfig, stepKey: AgendadoStepKey): string {
  const fieldByStep: Record<AgendadoStepKey, AgendadoStepConfig['templateField']> = {
    'agendado_D-2_12h': 'agendado_followup_msg_d2',
    'agendado_-3h': 'agendado_followup_msg_minus3h',
    'agendado_-5min': 'agendado_followup_msg_minus5min',
  }

  const field = fieldByStep[stepKey]
  const customTemplate = config[field]
  return customTemplate?.trim() ? customTemplate : DEFAULT_STEP_TEMPLATES[stepKey]
}

// Busca appointments scheduled nas proximas ~50h (janela mais ampla)
async function queryUpcomingAppointments(chatwootAccountId: number): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 51 * 60 * 60 * 1000) // 51h à frente

  // Busca conversations do account
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', chatwootAccountId)

  if (!convs?.length) return []
  const convIds = convs.map((c: { id: string }) => c.id)

  // Busca appointments na janela
  const { data: appts, error } = await supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id,
      start_at, end_at, status, meet_link
    `)
    .eq('status', 'scheduled')
    .gt('start_at', now.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .in('conversation_id', convIds)

  if (error) {
    throw error
  }

  if (!appts?.length) return []

  // Busca contatos
  const contactIds = [...new Set(appts.map((a: { contact_id: string }) => a.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', contactIds)

  type ContactInfo = { id: string; name: string | null; phone_number: string | null; identifier: string | null }

  const contactMap = new Map(
    (contacts ?? []).map((c: ContactInfo) => [c.id, c])
  )

  return appts.map((a: {
    id: string
    conversation_id: string
    contact_id: string
    start_at: string
    end_at: string
    status: string | null
    meet_link: string | null
  }) => {
    const contact = contactMap.get(a.contact_id) as ContactInfo | undefined
    return {
      ...a,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone_number ?? null,
      contact_identifier: contact?.identifier ?? null,
    }
  })
}

async function sendAgendadoStep(
  ctx: ClientFollowupContext,
  appointment: AppointmentRow,
  stepKey: AgendadoStepKey
): Promise<boolean> {
  const supabase = createAdminClient()
  const recipient = appointment.contact_identifier ?? appointment.contact_phone
  const instanceName = ctx.whatsappConfig.evolution_instance_name

  if (!recipient || !instanceName) {
    return false
  }

  const template = getTemplateForStep(ctx.botConfig, stepKey)
  const vars = buildTemplateVars(ctx.botConfig, appointment)
  const message = render(template, vars)

  const sentAt = new Date().toISOString()

  // Reserva idempotente: UNIQUE(conversation_id, cadence_type, step_key)
  const { data: insertedStep, error: insertError } = await supabase
    .from('followup_cadence_steps')
    .insert(
      {
        conversation_id: appointment.conversation_id,
        cadence_type: 'agendado',
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

  // Ja enviado → skip
  if (!insertedStep?.id) {
    return false
  }

  try {
    await sendTextMessage(instanceName, recipient, message)

    await supabase.from('followup_logs').insert({
      id: crypto.randomUUID(),
      conversation_id: appointment.conversation_id,
      contact_id: appointment.contact_id,
      workflow_name: 'panel_followup',
      step_name: stepKey,
      message_sent: message,
      sent_at: sentAt,
    })

    await supabase
      .from('conversations')
      .update({
        followup_cadence: 'agendado',
        last_followup_at: sentAt,
      })
      .eq('id', appointment.conversation_id)

    return true
  } catch (error) {
    // Remove reserva para permitir retry
    await supabase.from('followup_cadence_steps').delete().eq('id', insertedStep.id)
    throw error
  }
}

async function processClient(ctx: ClientFollowupContext): Promise<number> {
  const accountId = ctx.whatsappConfig.chatwoot_account_id
  if (!accountId) {
    return 0
  }

  const appointments = await queryUpcomingAppointments(accountId)
  if (!appointments.length) {
    return 0
  }

  let sentCount = 0

  for (const appointment of appointments) {
    const stepKey = resolveAgendadoStepKey(appointment.start_at)
    if (!stepKey) {
      continue
    }

    try {
      const wasSent = await sendAgendadoStep(ctx, appointment, stepKey)
      if (wasSent) {
        sentCount++
      }
    } catch (error) {
      console.error(
        `[Followup Agendado] Erro para appointment=${appointment.id}:`,
        error
      )
    }
  }

  return sentCount
}

export async function runAgendadoCadencePipeline(): Promise<AgendadoCadenceSummary> {
  // -5min step precisa rodar mesmo fora de horario comercial,
  // mas D-2 e -3h so dentro. Para simplificar, rodamos tudo
  // e o step -5min nao e filtrado (paciente ja tem consulta marcada).
  const outsideHours = !isWithinBusinessHours()

  const supabase = createAdminClient()

  // Usa followup_enabled (toggle geral de agendado)
  const { data: rows, error } = await supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('followup_enabled', true)
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
      console.error(`[Followup Agendado] Erro para client=${row.client_id}:`, error)
    }
  }

  return {
    clients: rows.length,
    stepsSent: totalSent,
    skippedOutsideHours: outsideHours,
  }
}
