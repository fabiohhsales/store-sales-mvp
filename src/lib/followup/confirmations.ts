import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import type { PanelBotConfig, PanelWhatsAppConfig } from '@/types/database'
import { normalizeAgendaStatus } from '@/lib/agenda/constants'

const TIMEZONE = 'America/Sao_Paulo'

export function isWithinBusinessHours(): boolean {
  const now = new Date()
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }).format(now)
  )
  return hour >= 8 && hour < 17
}

function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

interface AppointmentRow {
  id: string
  conversation_id: string
  contact_id: string
  google_event_id: string
  title: string | null
  start_at: string
  end_at: string
  status: string | null
  confirmation_sent_at: string | null
  reminder_sent_at: string | null
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

function buildTemplateVars(config: PanelBotConfig, appointment: AppointmentRow) {
  const start = new Date(appointment.start_at)
  return {
    patient_name: appointment.contact_name ?? 'Paciente',
    patient_phone: appointment.contact_phone ?? '',
    professional_name: config.professional_name,
    professional_title: config.professional_title ?? '',
    business_name: config.business_name ?? config.professional_name,
    service_name: config.services.find((service) => service.active)?.name ?? 'Consulta',
    date: new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(start),
    time: new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(start),
    day_of_week: new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, weekday: 'long' }).format(start),
    meet_link: appointment.meet_link ?? '',
  }
}

async function hydrateAppointments(rows: Array<Record<string, unknown>>) {
  const supabase = createAdminClient()
  const contactIds = [...new Set(rows.map((row) => row.contact_id as string))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', contactIds)

  const contactMap = new Map((contacts ?? []).map((contact: { id: string }) => [contact.id, contact]))

  return rows.map((row) => {
    const contact = contactMap.get(row.contact_id as string) as {
      name?: string | null
      phone_number?: string | null
      identifier?: string | null
    } | undefined

    return {
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      contact_id: row.contact_id as string,
      google_event_id: (row.google_event_id as string | null) ?? '',
      title: (row.title as string | null) ?? null,
      start_at: row.start_at as string,
      end_at: row.end_at as string,
      status: (row.status as string | null) ?? null,
      confirmation_sent_at: (row.confirmation_sent_at as string | null) ?? null,
      reminder_sent_at: (row.reminder_sent_at as string | null) ?? null,
      meet_link: (row.meet_link as string | null) ?? null,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone_number ?? null,
      contact_identifier: contact?.identifier ?? null,
    } satisfies AppointmentRow
  })
}

async function queryAppointments(
  clientId: string,
  windowStart: Date,
  windowEnd: Date,
  filterColumn: 'confirmation_sent_at' | 'reminder_sent_at'
): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id, google_event_id, title,
      start_at, end_at, status, confirmation_sent_at, reminder_sent_at, meet_link,
      conversations!inner(client_id)
    `)
    .is(filterColumn, null)
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .eq('conversations.client_id', clientId)

  if (error) throw error
  const scheduledRows = (data ?? []).filter((appointment) => normalizeAgendaStatus(appointment.status) === 'scheduled')
  return hydrateAppointments(scheduledRows as Array<Record<string, unknown>>)
}

async function queryNoShowAppointments(clientId: string): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id, google_event_id, title,
      start_at, end_at, status, confirmation_sent_at, reminder_sent_at, meet_link,
      conversations!inner(client_id)
    `)
    .not('confirmation_sent_at', 'is', null)
    .lt('start_at', now.toISOString())
    .gte('start_at', sixHoursAgo.toISOString())
    .eq('conversations.client_id', clientId)

  if (error) throw error
  const scheduledRows = (data ?? []).filter((appointment) => normalizeAgendaStatus(appointment.status) === 'scheduled')
  return hydrateAppointments(scheduledRows as Array<Record<string, unknown>>)
}

async function sendFollowup(
  ctx: ClientFollowupContext,
  appointment: AppointmentRow,
  message: string,
  updateField: 'confirmation_sent_at' | 'reminder_sent_at',
  logStep: string
) {
  const supabase = createAdminClient()
  const identifier = appointment.contact_identifier ?? appointment.contact_phone
  const instanceName = ctx.whatsappConfig.evolution_instance_name
  if (!identifier || !instanceName) return

  await sendTextMessage(instanceName, identifier, message)
  await supabase.from('appointments').update({
    [updateField]: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', appointment.id)

  await supabase.from('followup_logs').insert({
    id: crypto.randomUUID(),
    conversation_id: appointment.conversation_id,
    contact_id: appointment.contact_id,
    workflow_name: 'panel_followup',
    step_name: logStep,
    message_sent: message,
    sent_at: new Date().toISOString(),
  })
}

async function processClient(ctx: ClientFollowupContext) {
  const { botConfig, whatsappConfig } = ctx
  if (!whatsappConfig.evolution_instance_name) return { confirmations: 0, reminders: 0, noshows: 0 }

  const now = new Date()
  const confirmHours = botConfig.followup_confirmation_hours_before ?? 24
  const reminderHours = botConfig.followup_reminder_hours_before ?? 2

  let confirmations = 0
  let reminders = 0
  let noshows = 0

  const confirmWindow = {
    start: new Date(now.getTime() + (confirmHours - 1) * 60 * 60 * 1000),
    end: new Date(now.getTime() + (confirmHours + 1) * 60 * 60 * 1000),
  }
  const toConfirm = await queryAppointments(ctx.clientId, confirmWindow.start, confirmWindow.end, 'confirmation_sent_at')

  for (const appointment of toConfirm) {
    const template =
      botConfig.msg_confirmation ??
      'Olá {patient_name}! Lembramos da sua consulta com {professional_name} em {date} às {time}. Pode confirmar? Responda SIM ou NÃO.'
    await sendFollowup(
      ctx,
      appointment,
      render(template, buildTemplateVars(botConfig, appointment)),
      'confirmation_sent_at',
      'confirmacao_24h'
    )
    confirmations++
  }

  const reminderWindow = {
    start: new Date(now.getTime() + (reminderHours - 0.5) * 60 * 60 * 1000),
    end: new Date(now.getTime() + (reminderHours + 0.5) * 60 * 60 * 1000),
  }
  const toRemind = await queryAppointments(ctx.clientId, reminderWindow.start, reminderWindow.end, 'reminder_sent_at')

  for (const appointment of toRemind) {
    const template =
      botConfig.msg_reminder ??
      'Olá {patient_name}! Sua consulta com {professional_name} é hoje às {time}. Aguardamos você!'
    await sendFollowup(
      ctx,
      appointment,
      render(template, buildTemplateVars(botConfig, appointment)),
      'reminder_sent_at',
      'lembrete_2h'
    )
    reminders++
  }

  if (botConfig.followup_noshow_enabled) {
    const noShowAppointments = await queryNoShowAppointments(ctx.clientId)
    for (const appointment of noShowAppointments) {
      const template =
        botConfig.msg_noshow ??
        'Olá {patient_name}, notamos que você não compareceu à consulta de hoje. Gostaria de reagendar?'

      const supabase = createAdminClient()
      await supabase.from('appointments').update({
        status: 'noshow',
        updated_at: new Date().toISOString(),
      }).eq('id', appointment.id)

      const identifier = appointment.contact_identifier ?? appointment.contact_phone
      const instanceName = ctx.whatsappConfig.evolution_instance_name
      if (identifier && instanceName) {
        const message = render(template, buildTemplateVars(botConfig, appointment))
        await sendTextMessage(instanceName, identifier, message)
        await supabase.from('followup_logs').insert({
          id: crypto.randomUUID(),
          conversation_id: appointment.conversation_id,
          contact_id: appointment.contact_id,
          workflow_name: 'panel_followup',
          step_name: 'noshow',
          message_sent: message,
          sent_at: new Date().toISOString(),
        })
        noshows++
      }
    }
  }

  return { confirmations, reminders, noshows }
}

export interface FollowupSummary {
  clients: number
  confirmations: number
  reminders: number
  noshows: number
  skippedOutsideHours: boolean
}

export async function runFollowupPipeline(): Promise<FollowupSummary> {
  if (!isWithinBusinessHours()) {
    return { clients: 0, confirmations: 0, reminders: 0, noshows: 0, skippedOutsideHours: true }
  }

  const supabase = createAdminClient()
  const { data: configs } = await supabase
    .from('panel_bot_config')
    .select(`
      *,
      panel_clients!inner(id, status),
      panel_whatsapp_config(*)
    `)
    .eq('followup_enabled', true)
    .eq('panel_clients.status', 'active')

  if (!configs?.length) {
    return { clients: 0, confirmations: 0, reminders: 0, noshows: 0, skippedOutsideHours: false }
  }

  let totalConf = 0
  let totalRemind = 0
  let totalNoShow = 0

  for (const row of configs) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config) ? row.panel_whatsapp_config[0] : row.panel_whatsapp_config
    if (!whatsappConfig) continue

    try {
      const result = await processClient({
        clientId: row.client_id as string,
        botConfig: row as PanelBotConfig,
        whatsappConfig: whatsappConfig as PanelWhatsAppConfig,
      })
      totalConf += result.confirmations
      totalRemind += result.reminders
      totalNoShow += result.noshows
    } catch (error) {
      console.error(`[Followup] Erro para client=${row.client_id}:`, error)
    }
  }

  return {
    clients: configs.length,
    confirmations: totalConf,
    reminders: totalRemind,
    noshows: totalNoShow,
    skippedOutsideHours: false,
  }
}
