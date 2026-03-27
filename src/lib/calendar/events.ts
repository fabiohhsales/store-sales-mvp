// CRUD de eventos no Google Calendar + persistência na tabela appointments.

import { createAdminClient } from '@/lib/supabase/admin'
import type { CalendarClient } from './client'
import type { PanelBotConfig } from '@/types/database'
import type { BotAppointment } from '@/types/bot'

const TIMEZONE = 'America/Sao_Paulo'

// --- Helpers de template ---

function renderTemplate(template: string | null, vars: Record<string, string>): string {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

// --- Criação de evento ---

export interface CreateEventParams {
  calendarId: string
  conversationId: string
  contactId: string
  patientName: string
  patientPhone: string | null
  patientEmail?: string | null
  clientEmail?: string | null
  startISO: string
  endISO: string
  config: PanelBotConfig
}

export interface CreatedEvent {
  googleEventId: string
  meetLink: string | null
  appointment: BotAppointment
}

export async function createAppointment(
  calendar: CalendarClient,
  params: CreateEventParams
): Promise<CreatedEvent> {
  const serviceName = params.config.services.find((s) => s.active)?.name ?? 'Consulta'

  const title = renderTemplate(
    params.config.calendar_event_title_template ?? 'Consulta {service_name} — {patient_name}',
    { service_name: serviceName, patient_name: params.patientName }
  )

  const description = renderTemplate(
    params.config.calendar_event_description_template ??
      'Paciente: {patient_name}\nTelefone: {patient_phone}\nServiço: {service_name}\nAgendado via Sales Chat',
    {
      patient_name: params.patientName,
      patient_phone: params.patientPhone ?? '',
      service_name: serviceName,
    }
  )

  const attendees: { email: string }[] = []
  if (params.clientEmail) attendees.push({ email: params.clientEmail })
  if (params.config.calendar_send_invite_to_patient && params.patientEmail) {
    attendees.push({ email: params.patientEmail })
  }

  const eventBody: {
    summary: string
    description: string
    start: { dateTime: string; timeZone: string }
    end: { dateTime: string; timeZone: string }
    colorId?: string
    attendees?: { email: string }[]
    conferenceData?: { createRequest: { requestId: string } }
  } = {
    summary: title,
    description,
    start: { dateTime: params.startISO, timeZone: TIMEZONE },
    end: { dateTime: params.endISO, timeZone: TIMEZONE },
    colorId: params.config.calendar_color_id ?? undefined,
    ...(attendees.length > 0 ? { attendees } : {}),
  }

  if (params.config.calendar_create_meet_link) {
    eventBody.conferenceData = {
      createRequest: { requestId: crypto.randomUUID() },
    }
  }

  const res = await calendar.events.insert({
    calendarId: params.calendarId,
    requestBody: eventBody,
    conferenceDataVersion: params.config.calendar_create_meet_link ? 1 : 0,
    sendUpdates: params.config.calendar_send_invite_to_patient ? 'all' : 'none',
  })

  const googleEventId = res.data.id!
  const meetLink =
    (res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri) ?? null

  const appointment = await saveAppointment({
    conversationId: params.conversationId,
    contactId: params.contactId,
    googleEventId,
    title,
    startISO: params.startISO,
    endISO: params.endISO,
    meetLink,
  })

  return { googleEventId, meetLink, appointment }
}

// --- Atualização de evento (reagendamento) ---

export async function updateAppointmentEvent(
  calendar: CalendarClient,
  calendarId: string,
  googleEventId: string,
  newStartISO: string,
  newEndISO: string
): Promise<void> {
  await calendar.events.patch({
    calendarId,
    eventId: googleEventId,
    requestBody: {
      start: { dateTime: newStartISO, timeZone: TIMEZONE },
      end: { dateTime: newEndISO, timeZone: TIMEZONE },
    },
  })

  const supabase = createAdminClient()
  await supabase
    .from('appointments')
    .update({
      start_at: newStartISO,
      end_at: newEndISO,
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('google_event_id', googleEventId)
}

// --- Cancelamento ---

export async function deleteAppointmentEvent(
  calendar: CalendarClient,
  calendarId: string,
  googleEventId: string
): Promise<void> {
  await calendar.events.delete({ calendarId, eventId: googleEventId })

  const supabase = createAdminClient()
  await supabase
    .from('appointments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('google_event_id', googleEventId)
}

// --- Busca de evento ---

export async function getAppointmentByEventId(googleEventId: string): Promise<BotAppointment | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('appointments')
    .select('*')
    .eq('google_event_id', googleEventId)
    .maybeSingle()
  return (data as BotAppointment) ?? null
}

// --- Persistência ---

async function saveAppointment(data: {
  conversationId: string
  contactId: string
  googleEventId: string
  title: string
  startISO: string
  endISO: string
  meetLink: string | null
}): Promise<BotAppointment> {
  const supabase = createAdminClient()
  const { data: saved, error } = await supabase
    .from('appointments')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: data.conversationId,
      contact_id: data.contactId,
      google_event_id: data.googleEventId,
      title: data.title,
      start_at: data.startISO,
      end_at: data.endISO,
      status: 'scheduled',
      meet_link: data.meetLink,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Falha ao salvar appointment: ${error.message}`)
  return saved as BotAppointment
}
