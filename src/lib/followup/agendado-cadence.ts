import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { isWithinWorkingHours } from '@/lib/followup/business-hours'
import type { PanelBotConfig, PanelWhatsAppConfig } from '@/types/database'
import { normalizeAgendaStatus } from '@/lib/agenda/constants'

const DEFAULT_STEP_TEMPLATES = {
  'agendado_D-2_12h': 'Ola {patient_name}! Sua consulta com {professional_name} esta marcada para {day_of_week}, {date} as {time}. Podemos confirmar sua presenca?',
  'agendado_-3h': 'Oi {patient_name}, lembrete: sua consulta com {professional_name} e hoje as {time}. Nos vemos em breve!',
  'agendado_-5min': 'Ola {patient_name}, sua consulta comeca em instantes! {meet_link}',
} as const

type AgendadoStepKey = keyof typeof DEFAULT_STEP_TEMPLATES

const AGENDADO_STEPS = [
  { stepKey: 'agendado_D-2_12h' as const, minHoursBefore: 46, maxHoursBefore: 50, templateField: 'agendado_followup_msg_d2' as const },
  { stepKey: 'agendado_-3h' as const, minHoursBefore: 2.5, maxHoursBefore: 3.5, templateField: 'agendado_followup_msg_minus3h' as const },
  { stepKey: 'agendado_-5min' as const, minHoursBefore: 0.05, maxHoursBefore: 0.12, templateField: 'agendado_followup_msg_minus5min' as const },
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

function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

function buildTemplateVars(config: PanelBotConfig, appointment: AppointmentRow) {
  const start = new Date(appointment.start_at)
  const tz = config.timezone ?? 'America/Sao_Paulo'
  return {
    patient_name: appointment.contact_name ?? 'Paciente',
    professional_name: config.professional_name,
    business_name: config.business_name ?? config.professional_name,
    date: new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(start),
    time: new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(start),
    day_of_week: new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long' }).format(start),
    meet_link: appointment.meet_link ?? '',
  }
}

function resolveAgendadoStepKey(startAt: string): AgendadoStepKey | null {
  const hoursBefore = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60)
  const match = AGENDADO_STEPS.find((step) => hoursBefore >= step.minHoursBefore && hoursBefore < step.maxHoursBefore)
  return match?.stepKey ?? null
}

function getTemplateForStep(config: PanelBotConfig, stepKey: AgendadoStepKey) {
  const step = AGENDADO_STEPS.find((entry) => entry.stepKey === stepKey)
  const custom = step ? config[step.templateField] : null
  return custom?.trim() ? custom : DEFAULT_STEP_TEMPLATES[stepKey]
}

async function queryUpcomingAppointments(clientId: string): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 51 * 60 * 60 * 1000)

  const { data: appts, error } = await supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id, start_at, end_at, status, meet_link,
      conversations!inner(client_id)
    `)
    .gt('start_at', now.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .eq('conversations.client_id', clientId)

  if (error) throw error

  const scheduledAppointments = (appts ?? []).filter((appointment) => normalizeAgendaStatus(appointment.status) === 'scheduled')
  if (!scheduledAppointments.length) return []

  const contactIds = [...new Set(scheduledAppointments.map((appointment: { contact_id: string }) => appointment.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', contactIds)

  const contactMap = new Map((contacts ?? []).map((contact: { id: string }) => [contact.id, contact]))

  return scheduledAppointments.map((appointment: Record<string, unknown>) => {
    const contact = contactMap.get(appointment.contact_id as string) as {
      name?: string | null
      phone_number?: string | null
      identifier?: string | null
    } | undefined

    return {
      id: appointment.id as string,
      conversation_id: appointment.conversation_id as string,
      contact_id: appointment.contact_id as string,
      start_at: appointment.start_at as string,
      end_at: appointment.end_at as string,
      status: (appointment.status as string | null) ?? null,
      meet_link: (appointment.meet_link as string | null) ?? null,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone_number ?? null,
      contact_identifier: contact?.identifier ?? null,
    }
  })
}

async function sendAgendadoStep(ctx: ClientFollowupContext, appointment: AppointmentRow, stepKey: AgendadoStepKey) {
  const supabase = createAdminClient()
  const recipient = appointment.contact_identifier ?? appointment.contact_phone
  const instanceName = ctx.whatsappConfig.evolution_instance_name
  if (!recipient || !instanceName) return false

  const message = render(getTemplateForStep(ctx.botConfig, stepKey), buildTemplateVars(ctx.botConfig, appointment))
  const sentAt = new Date().toISOString()

  const { data: insertedStep, error: insertError } = await supabase
    .from('followup_cadence_steps')
    .upsert(
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

  if (insertError) throw insertError
  if (!insertedStep?.id) return false

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
    await supabase.from('conversations').update({
      followup_cadence: 'agendado',
      last_followup_at: sentAt,
    }).eq('id', appointment.conversation_id)
    return true
  } catch (error) {
    await supabase.from('followup_cadence_steps').delete().eq('id', insertedStep.id)
    throw error
  }
}

async function processClient(ctx: ClientFollowupContext) {
  if (!ctx.whatsappConfig.evolution_instance_name) return 0
  // Verifica working_hours real do cliente (não janela fixa 8–17).
  if (!isWithinWorkingHours(ctx.botConfig.working_hours, ctx.botConfig.timezone ?? 'America/Sao_Paulo')) return 0
  const appointments = await queryUpcomingAppointments(ctx.clientId)
  let sentCount = 0

  for (const appointment of appointments) {
    const stepKey = resolveAgendadoStepKey(appointment.start_at)
    if (!stepKey) continue
    try {
      const sent = await sendAgendadoStep(ctx, appointment, stepKey)
      if (sent) sentCount++
    } catch (error) {
      console.error(`[Followup Agendado] Erro para appointment=${appointment.id}:`, error)
    }
  }

  return sentCount
}

export async function runAgendadoCadencePipeline(): Promise<AgendadoCadenceSummary> {
  // Sem check global — cada cliente é verificado no seu próprio timezone dentro de processClient()
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('followup_enabled', true)
    .eq('panel_clients.status', 'active')

  if (error) throw error
  if (!rows?.length) return { clients: 0, stepsSent: 0, skippedOutsideHours: false }

  let totalSent = 0
  for (const row of rows) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config) ? row.panel_whatsapp_config[0] : row.panel_whatsapp_config
    if (!whatsappConfig) continue

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
    skippedOutsideHours: false,
  }
}
