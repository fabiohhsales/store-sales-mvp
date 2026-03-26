// Pipeline de follow-up: confirmação 24h antes, lembrete 2h antes, no-show pós-consulta.
// Substitui os workflows wf-calendar.json e wf-confirmacao.json do n8n.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import type { PanelBotConfig, PanelWhatsAppConfig } from '@/types/database'

const TIMEZONE = 'America/Sao_Paulo'

// --- Verificação de horário comercial (8h–17h SP) ---

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

// --- Template renderer ---

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
    patient_phone: appointment.contact_phone ?? '',
    professional_name: config.professional_name,
    professional_title: config.professional_title ?? '',
    business_name: config.business_name ?? config.professional_name,
    service_name: config.services.find((s) => s.active)?.name ?? 'Consulta',
    date,
    time,
    day_of_week: dayOfWeek,
    meet_link: appointment.meet_link ?? '',
  }
}

// --- Tipos internos ---

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

// --- Query de appointments por janela de tempo ---

async function queryAppointments(
  chatwootAccountId: number,
  windowStart: Date,
  windowEnd: Date,
  filterColumn: 'confirmation_sent_at' | 'reminder_sent_at'
): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()

  // JOIN: appointments → contacts + conversations (filtrado por account_id do cliente)
  const { data, error } = await supabase.rpc('get_appointments_for_followup', {
    p_account_id: chatwootAccountId,
    p_window_start: windowStart.toISOString(),
    p_window_end: windowEnd.toISOString(),
    p_filter_column: filterColumn,
  })

  if (error) {
    // Fallback: query manual sem RPC
    return queryAppointmentsFallback(chatwootAccountId, windowStart, windowEnd, filterColumn)
  }

  return (data ?? []) as AppointmentRow[]
}

// Fallback manual caso a RPC não exista ainda
async function queryAppointmentsFallback(
  chatwootAccountId: number,
  windowStart: Date,
  windowEnd: Date,
  filterColumn: 'confirmation_sent_at' | 'reminder_sent_at'
): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()

  // Busca conversations do cliente pelo account_id
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', chatwootAccountId)

  if (!convs?.length) return []

  const convIds = convs.map((c: { id: string }) => c.id)

  // Busca appointments dessas conversations na janela de tempo
  const query = supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id, google_event_id, title,
      start_at, end_at, status, confirmation_sent_at, reminder_sent_at, meet_link
    `)
    .eq('status', 'scheduled')
    .is(filterColumn, null)
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .in('conversation_id', convIds)

  const { data: appts } = await query
  if (!appts?.length) return []

  // Busca dados dos contatos
  const contactIds = [...new Set(appts.map((a: { contact_id: string }) => a.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', contactIds)

  const contactMap = new Map(
    (contacts ?? []).map((c: { id: string; name: string | null; phone_number: string | null; identifier: string | null }) => [
      c.id,
      c,
    ])
  )

  return appts.map((a: {
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
  }) => {
    const contact = contactMap.get(a.contact_id)
    return {
      ...a,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone_number ?? null,
      contact_identifier: contact?.identifier ?? null,
    }
  })
}

// Busca appointments já passados sem resposta (no-show)
async function queryNoShowAppointments(
  chatwootAccountId: number
): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', chatwootAccountId)

  if (!convs?.length) return []
  const convIds = convs.map((c: { id: string }) => c.id)

  const { data: appts } = await supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id, google_event_id, title,
      start_at, end_at, status, confirmation_sent_at, reminder_sent_at, meet_link
    `)
    .eq('status', 'scheduled')
    .not('confirmation_sent_at', 'is', null) // confirmação foi enviada
    .lt('start_at', now.toISOString())       // já passou
    .gte('start_at', sixHoursAgo.toISOString()) // mas não faz mais de 6h
    .in('conversation_id', convIds)

  if (!appts?.length) return []

  const contactIds = [...new Set(appts.map((a: { contact_id: string }) => a.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', contactIds)

  const contactMap = new Map(
    (contacts ?? []).map((c: { id: string; name: string | null; phone_number: string | null; identifier: string | null }) => [c.id, c])
  )

  return appts.map((a: {
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
  }) => {
    const contact = contactMap.get(a.contact_id)
    return {
      ...a,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone_number ?? null,
      contact_identifier: contact?.identifier ?? null,
    }
  })
}

// --- Envio e atualização ---

async function sendFollowup(
  ctx: ClientFollowupContext,
  appointment: AppointmentRow,
  message: string,
  updateField: 'confirmation_sent_at' | 'reminder_sent_at',
  logStep: string
): Promise<void> {
  const supabase = createAdminClient()
  const identifier = appointment.contact_identifier ?? appointment.contact_phone
  const instanceName = ctx.whatsappConfig.evolution_instance_name

  if (!identifier || !instanceName) return

  await sendTextMessage(instanceName, identifier, message)

  // Atualiza o campo sent_at
  await supabase
    .from('appointments')
    .update({ [updateField]: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', appointment.id)

  // Log na tabela followup_logs
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

// --- Processamento por cliente ---

async function processClient(ctx: ClientFollowupContext): Promise<{
  confirmations: number
  reminders: number
  noshows: number
}> {
  const { botConfig, whatsappConfig } = ctx
  const accountId = whatsappConfig.chatwoot_account_id
  if (!accountId) return { confirmations: 0, reminders: 0, noshows: 0 }

  const now = new Date()
  const confirmHours = botConfig.followup_confirmation_hours_before ?? 24
  const reminderHours = botConfig.followup_reminder_hours_before ?? 2

  let confirmations = 0
  let reminders = 0
  let noshows = 0

  // --- Confirmações (X horas antes) ---
  const confWindow = {
    start: new Date(now.getTime() + (confirmHours - 1) * 60 * 60 * 1000),
    end: new Date(now.getTime() + (confirmHours + 1) * 60 * 60 * 1000),
  }
  const toConfirm = await queryAppointments(accountId, confWindow.start, confWindow.end, 'confirmation_sent_at')

  for (const appt of toConfirm) {
    const template = botConfig.msg_confirmation ??
      'Olá {patient_name}! Lembramos da sua consulta com {professional_name} em {date} às {time}. Pode confirmar? Responda SIM ou NÃO.'
    const vars = buildTemplateVars(botConfig, appt)
    const message = render(template, vars)
    await sendFollowup(ctx, appt, message, 'confirmation_sent_at', 'confirmacao_24h')
    confirmations++
  }

  // --- Lembretes (Y horas antes) ---
  const reminderWindow = {
    start: new Date(now.getTime() + (reminderHours - 0.5) * 60 * 60 * 1000),
    end: new Date(now.getTime() + (reminderHours + 0.5) * 60 * 60 * 1000),
  }
  const toRemind = await queryAppointments(accountId, reminderWindow.start, reminderWindow.end, 'reminder_sent_at')

  for (const appt of toRemind) {
    const template = botConfig.msg_reminder ??
      'Olá {patient_name}! Sua consulta com {professional_name} é hoje às {time}. Aguardamos você!'
    const vars = buildTemplateVars(botConfig, appt)
    const message = render(template, vars)
    await sendFollowup(ctx, appt, message, 'reminder_sent_at', 'lembrete_2h')
    reminders++
  }

  // --- No-show ---
  if (botConfig.followup_noshow_enabled) {
    const noshowAppts = await queryNoShowAppointments(accountId)
    for (const appt of noshowAppts) {
      const template = botConfig.msg_noshow ??
        'Olá {patient_name}, notamos que você não compareceu à consulta de hoje. Gostaria de reagendar?'
      const vars = buildTemplateVars(botConfig, appt)
      const message = render(template, vars)

      // No-show não tem campo próprio na tabela — marca status como 'noshow'
      const supabase = createAdminClient()
      await supabase
        .from('appointments')
        .update({ status: 'noshow', updated_at: new Date().toISOString() })
        .eq('id', appt.id)

      const identifier = appt.contact_identifier ?? appt.contact_phone
      const instanceName = ctx.whatsappConfig.evolution_instance_name
      if (identifier && instanceName) {
        await sendTextMessage(instanceName, identifier, message)
        await supabase.from('followup_logs').insert({
          id: crypto.randomUUID(),
          conversation_id: appt.conversation_id,
          contact_id: appt.contact_id,
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

// --- Entry point público ---

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

  // Busca todos os clientes ativos com followup habilitado
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

  let totalConf = 0, totalRemind = 0, totalNoshow = 0

  for (const row of configs) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config)
      ? row.panel_whatsapp_config[0]
      : row.panel_whatsapp_config

    if (!whatsappConfig) continue

    try {
      const result = await processClient({
        clientId: row.client_id as string,
        botConfig: row as PanelBotConfig,
        whatsappConfig: whatsappConfig as PanelWhatsAppConfig,
      })
      totalConf += result.confirmations
      totalRemind += result.reminders
      totalNoshow += result.noshows
    } catch (err) {
      console.error(`[Followup] Erro para client=${row.client_id}:`, err)
    }
  }

  return {
    clients: configs.length,
    confirmations: totalConf,
    reminders: totalRemind,
    noshows: totalNoshow,
    skippedOutsideHours: false,
  }
}
