// Invite Orchestrator: decide quem recebe convite, via qual canal, e executa.
// Separação de responsabilidades: agenda/commands chama orchestrateInvite() após persistir.
// Google Calendar sync e SMTP são camadas de comunicação, não de decisão.

import { sendCalendarInvite } from '@/lib/email/service'
import { getCalendarClientForConfig } from '@/lib/calendar/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PanelBotConfig, PanelGoogleConfig } from '@/types/database'
import type { AgendaAppointment } from '@/types/pipeline'
import type { CalendarClient } from '@/lib/calendar/client'

export interface InviteContext {
  appointment: AgendaAppointment
  clientId: string
  /** Email do lead/paciente (se coletado). */
  leadEmail?: string | null
  /** Email operacional do profissional (agenda_recipient_email ?? google_email). */
  professionalEmail?: string | null
  /** Se true, sincroniza com Google Calendar. */
  syncToGoogle?: boolean
  /** Campos para construir evento no Google. */
  contactName?: string | null
  contactPhone?: string | null
  title?: string | null
  notes?: string | null
}

export interface InviteResult {
  smtpSent: boolean
  smtpError: string | null
  smtpRecipients: string[]
  googleSynced: boolean
  googleError: string | null
  externalEventId: string | null
  meetLink: string | null
}

/**
 * Resolve o email do profissional via fallback chain:
 * agenda_recipient_email → google_email → null
 */
export function resolveProfessionalEmail(
  botConfig: PanelBotConfig | null,
  googleConfig: PanelGoogleConfig | null,
): string | null {
  return botConfig?.agenda_recipient_email ?? googleConfig?.google_email ?? null
}

/**
 * Orquestra envio de convite (SMTP + Google Calendar sync).
 * Chamado APÓS a persistência do appointment.
 */
export async function orchestrateInvite(ctx: InviteContext): Promise<InviteResult> {
  const result: InviteResult = {
    smtpSent: false,
    smtpError: null,
    smtpRecipients: [],
    googleSynced: false,
    googleError: null,
    externalEventId: ctx.appointment.external_event_id ?? null,
    meetLink: ctx.appointment.meet_link ?? null,
  }

  // --- Carregar configs do cliente ---
  const admin = createAdminClient()
  const [{ data: botConfig }, { data: googleConfig }] = await Promise.all([
    admin.from('panel_bot_config').select('*').eq('client_id', ctx.clientId).maybeSingle(),
    admin.from('panel_google_config').select('*').eq('client_id', ctx.clientId).maybeSingle(),
  ])

  const professionalName = (botConfig as PanelBotConfig | null)?.professional_name ?? 'Profissional'
  const timezone = (botConfig as PanelBotConfig | null)?.timezone ?? 'America/Sao_Paulo'
  const sendInviteToPatient = (botConfig as PanelBotConfig | null)?.calendar_send_invite_to_patient ?? false

  // --- 1. SMTP Calendar Invite ---
  const recipientEmails: string[] = []

  // Profissional é destinatário obrigatório (se tiver email)
  const profEmail = ctx.professionalEmail ?? resolveProfessionalEmail(
    botConfig as PanelBotConfig | null,
    googleConfig as PanelGoogleConfig | null,
  )
  if (profEmail?.includes('@')) {
    recipientEmails.push(profEmail)
  }

  // Lead é destinatário opcional
  if (sendInviteToPatient && ctx.leadEmail?.includes('@')) {
    recipientEmails.push(ctx.leadEmail)
  }

  if (recipientEmails.length > 0) {
    const serviceName = ctx.title?.trim() || ctx.appointment.title?.trim() || 'Consulta'
    const patientName = ctx.contactName?.trim() || 'Paciente'

    const inviteResult = await sendCalendarInvite({
      appointmentId: ctx.appointment.id,
      summary: `${serviceName} - ${patientName}`,
      description: [
        `Paciente: ${patientName}`,
        ctx.contactPhone ? `Telefone: ${ctx.contactPhone}` : null,
        `Serviço: ${serviceName}`,
        'Agendado via Sales Tec',
      ].filter(Boolean).join('\n'),
      startAt: ctx.appointment.start_at,
      endAt: ctx.appointment.end_at,
      timezone,
      organizerEmail: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@chatsales.com.br',
      organizerName: professionalName,
      recipientEmails,
    })

    result.smtpSent = inviteResult.success
    result.smtpError = inviteResult.error
    result.smtpRecipients = recipientEmails

    if (!inviteResult.success) {
      console.warn('[InviteOrchestrator] SMTP invite failed:', inviteResult.error)
    }
  }

  // --- 2. Google Calendar Sync ---
  if (ctx.syncToGoogle !== false) {
    const calendar = getCalendarClientForConfig((googleConfig as PanelGoogleConfig | null) ?? null)
    const calendarId = (googleConfig as PanelGoogleConfig | null)?.calendar_id

    if (calendar && calendarId) {
      try {
        const syncResult = await syncToGoogleCalendar({
          calendar,
          calendarId,
          appointment: ctx.appointment,
          botConfig: botConfig as PanelBotConfig | null,
          googleEmail: (googleConfig as PanelGoogleConfig | null)?.google_email ?? null,
          contactName: ctx.contactName ?? null,
          contactPhone: ctx.contactPhone ?? null,
          sendInviteToPatient,
          patientEmail: ctx.leadEmail ?? null,
        })

        result.googleSynced = true
        result.externalEventId = syncResult.eventId
        result.meetLink = syncResult.meetLink

        // Atualiza appointment com resultado do sync
        await admin
          .from('appointments')
          .update({
            sync_status: 'synced',
            sync_error: null,
            external_event_id: syncResult.eventId,
            external_calendar_id: calendarId,
            meet_link: syncResult.meetLink,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', ctx.appointment.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao sincronizar'
        const isAuthError = error instanceof Error && /invalid_grant|token.*revoked|token.*expired/i.test(error.message)

        result.googleError = isAuthError ? 'Token Google expirado — reautorize o calendário' : message

        await admin
          .from('appointments')
          .update({
            sync_status: 'error',
            sync_error: result.googleError,
          })
          .eq('id', ctx.appointment.id)

        console.error('[InviteOrchestrator] Google sync failed:', message)
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Google Calendar sync helper (extraído de service.ts para reuso)
// ---------------------------------------------------------------------------

async function syncToGoogleCalendar(options: {
  calendar: CalendarClient
  calendarId: string
  appointment: AgendaAppointment
  botConfig: PanelBotConfig | null
  googleEmail: string | null
  contactName: string | null
  contactPhone: string | null
  sendInviteToPatient: boolean
  patientEmail: string | null
}): Promise<{ eventId: string | null; meetLink: string | null }> {
  const { appointment, calendar, calendarId, botConfig } = options
  const tz = botConfig?.timezone ?? 'America/Sao_Paulo'

  const serviceName = appointment.title?.trim() || 'Consulta'
  const patientName = options.contactName?.trim() || 'Paciente'
  const professionalName = botConfig?.professional_name ?? ''

  const vars = {
    service_name: serviceName,
    patient_name: patientName,
    professional_name: professionalName,
    patient_phone: options.contactPhone ?? '',
  }

  const summary = renderTemplate(
    botConfig?.calendar_event_title_template ?? '[{professional_name}] {service_name} - {patient_name}',
    vars,
  ) || `${serviceName} - ${patientName}`

  const description = renderTemplate(
    botConfig?.calendar_event_description_template ??
    'Profissional: {professional_name}\nPaciente: {patient_name}\nTelefone: {patient_phone}\nServico: {service_name}\nAgendado via Sales Tec',
    vars,
  )

  const attendees: Array<{ email: string }> = []
  if (options.googleEmail) attendees.push({ email: options.googleEmail })
  if (options.sendInviteToPatient && options.patientEmail) attendees.push({ email: options.patientEmail })

  const requestBody = {
    summary,
    description,
    start: { dateTime: appointment.start_at, timeZone: tz },
    end: { dateTime: appointment.end_at, timeZone: tz },
    colorId: botConfig?.calendar_color_id ?? undefined,
    attendees: attendees.length > 0 ? attendees : undefined,
    conferenceData: botConfig?.calendar_create_meet_link
      ? { createRequest: { requestId: crypto.randomUUID() } }
      : undefined,
  }

  const conferenceDataVersion = botConfig?.calendar_create_meet_link ? 1 : 0
  const sendUpdates = attendees.length > 0 ? 'all' as const : 'none' as const
  const existingEventId = appointment.external_event_id ?? appointment.google_event_id

  if (existingEventId) {
    const response = await calendar.events.patch({
      calendarId,
      eventId: existingEventId,
      requestBody,
      conferenceDataVersion,
      sendUpdates,
    })

    return {
      eventId: response.data.id ?? existingEventId,
      meetLink: response.data.hangoutLink ??
        response.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null,
    }
  }

  const response = await calendar.events.insert({
    calendarId,
    requestBody,
    conferenceDataVersion,
    sendUpdates,
  })

  return {
    eventId: response.data.id ?? null,
    meetLink: response.data.hangoutLink ??
      response.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null,
  }
}

function renderTemplate(template: string | null, vars: Record<string, string>): string {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}
