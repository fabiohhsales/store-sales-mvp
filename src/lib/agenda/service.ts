import { createAdminClient } from '@/lib/supabase/admin'
import { getCalendarClientForConfig } from '@/lib/calendar/client'
import type { CalendarClient } from '@/lib/calendar/client'
import type { PanelBotConfig, PanelGoogleConfig } from '@/types/database'
import type { AgendaAppointment } from '@/types/pipeline'
import {
  AGENDA_STATUSES,
  type AgendaStatus,
  type AgendaSyncStatus,
  type AgendaView,
  normalizeAgendaStatus,
  normalizeAgendaSyncStatus,
} from './constants'

const TIMEZONE = 'America/Sao_Paulo'

export interface AgendaListParams {
  clientId: string
  view?: AgendaView
  date?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  status?: string | null
  query?: string | null
  contactId?: string | null
  page?: number
  pageSize?: number
}

export interface AgendaListResult {
  items: AgendaAppointment[]
  meta: {
    view: AgendaView
    date: string
    date_from: string
    date_to: string
    page: number
    page_size: number
    total: number
    total_pages: number
  }
  totals: Record<string, number>
}

export interface AgendaUpsertInput {
  clientId: string
  conversationId?: string | null
  contactId?: string | null
  contactName?: string | null
  contactPhone?: string | null
  title?: string | null
  modality?: string | null
  status?: AgendaStatus | null
  notes?: string | null
  startAt: string
  endAt: string
  syncToGoogle?: boolean
  source?: string | null
}

interface ContextRow {
  googleConfig: PanelGoogleConfig | null
  botConfig: PanelBotConfig | null
  contactId: string
  conversationId: string
  contactName: string | null
  contactPhone: string | null
}

interface CalendarSyncResult {
  sync_status: AgendaSyncStatus
  sync_error: string | null
  external_calendar_id: string | null
  external_event_id: string | null
  google_event_id: string | null
  meet_link: string | null
  last_synced_at: string | null
}

function defaultView(view: string | null | undefined): AgendaView {
  if (view === 'day' || view === 'week' || view === 'month' || view === 'list') return view
  return 'week'
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function startOfWeek(date: Date) {
  const result = startOfDay(date)
  result.setDate(result.getDate() - result.getDay())
  return result
}

function endOfWeek(date: Date) {
  const result = startOfWeek(date)
  result.setDate(result.getDate() + 6)
  return endOfDay(result)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function resolveDateRange(params: Pick<AgendaListParams, 'view' | 'date' | 'dateFrom' | 'dateTo'>) {
  const anchor = params.date ? new Date(`${params.date}T12:00:00`) : new Date()
  const view = defaultView(params.view)
  let from = params.dateFrom ? new Date(`${params.dateFrom}T00:00:00`) : null
  let to = params.dateTo ? new Date(`${params.dateTo}T23:59:59`) : null

  if (!from || !to) {
    if (view === 'day') {
      from = startOfDay(anchor)
      to = endOfDay(anchor)
    } else if (view === 'month') {
      from = startOfMonth(anchor)
      to = endOfMonth(anchor)
    } else {
      from = startOfWeek(anchor)
      to = endOfWeek(anchor)
    }
  }

  return {
    view,
    anchor: isoDate(anchor),
    from,
    to,
  }
}

function renderTemplate(template: string | null, vars: Record<string, string>) {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

function buildEventPayload(input: {
  title: string | null
  notes: string | null
  startAt: string
  endAt: string
  contactName: string | null
  contactPhone: string | null
  botConfig: PanelBotConfig | null
}) {
  const serviceName =
    input.title?.trim() ||
    input.botConfig?.services.find((service) => service.active)?.name ||
    'Consulta'
  const patientName = input.contactName?.trim() || 'Paciente'
  const professionalName = input.botConfig?.professional_name ?? ''

  const vars = {
    service_name: serviceName,
    patient_name: patientName,
    professional_name: professionalName,
    patient_phone: input.contactPhone ?? '',
  }

  const summary = renderTemplate(
    input.botConfig?.calendar_event_title_template ?? '[{professional_name}] {service_name} - {patient_name}',
    vars
  ) || `${serviceName} - ${patientName}`

  const templateDescription =
    input.botConfig?.calendar_event_description_template ??
    'Profissional: {professional_name}\nPaciente: {patient_name}\nTelefone: {patient_phone}\nServico: {service_name}\nAgendado via Sales Tec'

  const description = [renderTemplate(templateDescription, vars), input.notes?.trim() ?? '']
    .filter(Boolean)
    .join('\n\n')

  return {
    requestBody: {
      summary,
      description,
      start: { dateTime: input.startAt, timeZone: TIMEZONE },
      end: { dateTime: input.endAt, timeZone: TIMEZONE },
      colorId: input.botConfig?.calendar_color_id ?? undefined,
      conferenceData: input.botConfig?.calendar_create_meet_link
        ? {
            createRequest: {
              requestId: crypto.randomUUID(),
            },
          }
        : undefined,
    },
    conferenceDataVersion: input.botConfig?.calendar_create_meet_link ? 1 : 0,
  }
}

async function getClientConfigs(clientId: string) {
  const admin = createAdminClient()
  const [{ data: googleConfig }, { data: botConfig }] = await Promise.all([
    admin.from('panel_google_config').select('*').eq('client_id', clientId).maybeSingle(),
    admin.from('panel_bot_config').select('*').eq('client_id', clientId).maybeSingle(),
  ])

  return {
    googleConfig: (googleConfig as PanelGoogleConfig | null) ?? null,
    botConfig: (botConfig as PanelBotConfig | null) ?? null,
  }
}

async function ensureContactAndConversation(input: AgendaUpsertInput): Promise<ContextRow> {
  const admin = createAdminClient()
  let contactId = input.contactId ?? null
  let conversationId = input.conversationId ?? null
  let contactName = input.contactName?.trim() || null
  let contactPhone = input.contactPhone?.replace(/\D/g, '') || null

  if (contactId) {
    const { data: existingContact } = await admin
      .from('contacts')
      .select('id, name, phone_number')
      .eq('id', contactId)
      .eq('client_id', input.clientId)
      .maybeSingle()

    if (!existingContact) {
      throw new Error('Contato inválido para este cliente')
    }

    contactName = contactName ?? existingContact.name
    contactPhone = contactPhone ?? existingContact.phone_number
  } else if (contactPhone) {
    const { data: contactByPhone } = await admin
      .from('contacts')
      .select('id, name, phone_number')
      .eq('client_id', input.clientId)
      .eq('phone_number', contactPhone)
      .maybeSingle()

    if (contactByPhone) {
      contactId = contactByPhone.id
      contactName = contactName ?? contactByPhone.name
      contactPhone = contactPhone ?? contactByPhone.phone_number
    }
  }

  if (!contactId) {
    const { data: createdContact, error: contactError } = await admin
      .from('contacts')
      .insert({
        id: crypto.randomUUID(),
        client_id: input.clientId,
        name: contactName,
        phone_number: contactPhone,
        identifier: contactPhone ? `${contactPhone}@manual` : null,
        created_at: new Date().toISOString(),
      })
      .select('id, name, phone_number')
      .single()

    if (contactError) throw new Error(`Falha ao criar contato: ${contactError.message}`)
    contactId = createdContact.id
    contactName = createdContact.name
    contactPhone = createdContact.phone_number
  }

  if (conversationId) {
    const { data: existingConversation } = await admin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('client_id', input.clientId)
      .eq('contact_id', contactId)
      .maybeSingle()

    if (!existingConversation) {
      throw new Error('Conversa inválida para este cliente')
    }
  } else {
    const { data: latestConversation } = await admin
      .from('conversations')
      .select('id')
      .eq('client_id', input.clientId)
      .eq('contact_id', contactId)
      .neq('stage', 'resolved')
      .order('last_incoming_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (latestConversation?.id) {
      conversationId = latestConversation.id
    } else {
      const { data: createdConversation, error: conversationError } = await admin
        .from('conversations')
        .insert({
          id: crypto.randomUUID(),
          client_id: input.clientId,
          contact_id: contactId,
          status: 'open',
          stage: 'bot_triage',
          labels: [],
          appointment_status: input.status ?? 'scheduled',
          last_incoming_at: null,
        })
        .select('id')
        .single()

      if (conversationError) {
        throw new Error(`Falha ao criar conversa: ${conversationError.message}`)
      }
      conversationId = createdConversation.id
    }
  }

  const { googleConfig, botConfig } = await getClientConfigs(input.clientId)
  return {
    contactId: contactId as string,
    conversationId: conversationId as string,
    contactName,
    contactPhone,
    googleConfig,
    botConfig,
  }
}

async function syncAppointmentEvent(options: {
  calendar: CalendarClient
  calendarId: string
  appointmentId: string
  existingEventId?: string | null
  title: string | null
  notes: string | null
  startAt: string
  endAt: string
  contactName: string | null
  contactPhone: string | null
  botConfig: PanelBotConfig | null
}) {
  const payload = buildEventPayload(options)

  if (options.existingEventId) {
    const response = await options.calendar.events.patch({
      calendarId: options.calendarId,
      eventId: options.existingEventId,
      requestBody: payload.requestBody,
      conferenceDataVersion: payload.conferenceDataVersion,
    })

    return {
      eventId: response.data.id ?? options.existingEventId,
      meetLink:
        response.data.hangoutLink ??
        response.data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ??
        null,
    }
  }

  const response = await options.calendar.events.insert({
    calendarId: options.calendarId,
    requestBody: payload.requestBody,
    conferenceDataVersion: payload.conferenceDataVersion,
    sendUpdates: 'none',
  })

  return {
    eventId: response.data.id ?? null,
    meetLink:
      response.data.hangoutLink ??
      response.data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ??
      null,
  }
}

async function buildSyncResult(options: {
  clientId: string
  title: string | null
  notes: string | null
  startAt: string
  endAt: string
  contactName: string | null
  contactPhone: string | null
  syncToGoogle?: boolean
  existingEventId?: string | null
}): Promise<CalendarSyncResult> {
  const shouldSync = options.syncToGoogle !== false
  const { googleConfig, botConfig } = await getClientConfigs(options.clientId)

  if (!shouldSync) {
    return {
      sync_status: 'disabled',
      sync_error: null,
      external_calendar_id: null,
      external_event_id: null,
      google_event_id: null,
      meet_link: null,
      last_synced_at: null,
    }
  }

  const calendar = getCalendarClientForConfig(googleConfig ?? null)

  if (!calendar || !googleConfig?.calendar_id) {
    return {
      sync_status: 'disabled',
      sync_error: 'Google Calendar não configurado para este cliente',
      external_calendar_id: googleConfig?.calendar_id ?? null,
      external_event_id: options.existingEventId ?? null,
      google_event_id: options.existingEventId ?? null,
      meet_link: null,
      last_synced_at: null,
    }
  }

  try {
    const synced = await syncAppointmentEvent({
      calendar,
      calendarId: googleConfig.calendar_id,
      appointmentId: '',
      existingEventId: options.existingEventId ?? null,
      title: options.title,
      notes: options.notes,
      startAt: options.startAt,
      endAt: options.endAt,
      contactName: options.contactName,
      contactPhone: options.contactPhone,
      botConfig,
    })

    return {
      sync_status: 'synced',
      sync_error: null,
      external_calendar_id: googleConfig.calendar_id,
      external_event_id: synced.eventId,
      google_event_id: synced.eventId,
      meet_link: synced.meetLink,
      last_synced_at: new Date().toISOString(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao sincronizar com Google Calendar'
    return {
      sync_status: 'error',
      sync_error: message,
      external_calendar_id: googleConfig.calendar_id ?? null,
      external_event_id: options.existingEventId ?? null,
      google_event_id: options.existingEventId ?? null,
      meet_link: null,
      last_synced_at: null,
    }
  }
}

function mapAppointmentRow(row: Record<string, unknown>): AgendaAppointment {
  const contactRaw = row.contacts as
    | { id?: string | null; name?: string | null; phone_number?: string | null }
    | Array<{ id?: string | null; name?: string | null; phone_number?: string | null }>
    | null
  const contact = Array.isArray(contactRaw) ? contactRaw[0] ?? null : contactRaw

  return {
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    contact_id: (row.contact_id as string | null) ?? contact?.id ?? null,
    contact_name: contact?.name ?? null,
    contact_phone: contact?.phone_number ?? null,
    title: (row.title as string | null) ?? null,
    start_at: row.start_at as string,
    end_at: row.end_at as string,
    modality: (row.modality as string | null) ?? null,
    status: normalizeAgendaStatus((row.status as string | null) ?? null),
    meet_link: (row.meet_link as string | null) ?? null,
    google_event_id:
      (row.google_event_id as string | null) ??
      (row.external_event_id as string | null) ??
      '',
    confirmation_sent_at: (row.confirmation_sent_at as string | null) ?? null,
    confirmation_response: (row.confirmation_response as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
    source: (row.source as string | null) ?? 'supabase',
    sync_status: normalizeAgendaSyncStatus((row.sync_status as string | null) ?? null),
    sync_error: (row.sync_error as string | null) ?? null,
    external_calendar_id: (row.external_calendar_id as string | null) ?? null,
    external_event_id:
      (row.external_event_id as string | null) ??
      (row.google_event_id as string | null) ??
      null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }
}

function filterAppointments(items: AgendaAppointment[], params: AgendaListParams) {
  const query = params.query?.trim().toLowerCase()
  const status = normalizeAgendaStatus(params.status)

  return items.filter((item) => {
    if (params.contactId && item.contact_id !== params.contactId) return false
    if (status && item.status !== status) return false
    if (!query) return true

    const haystack = [
      item.contact_name,
      item.contact_phone,
      item.title,
      item.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

export async function listAgendaAppointments(params: AgendaListParams): Promise<AgendaListResult> {
  const admin = createAdminClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50))
  const range = resolveDateRange(params)

  console.log('[agenda/service] listAgendaAppointments start', {
    clientId: params.clientId,
    view: params.view,
    dateFrom: range.from.toISOString(),
    dateTo: range.to.toISOString(),
  })

  const { data, error } = await admin
    .from('appointments')
    .select(`
      id,
      conversation_id,
      contact_id,
      title,
      start_at,
      end_at,
      modality,
      status,
      meet_link,
      google_event_id,
      confirmation_sent_at,
      confirmation_response,
      created_at,
      updated_at,
      source,
      sync_status,
      sync_error,
      external_calendar_id,
      external_event_id,
      last_synced_at,
      notes,
      contacts(id, name, phone_number),
      conversations!fk_appointments_conversation!inner(client_id)
    `)
    .eq('conversations.client_id', params.clientId)
    .gte('start_at', range.from.toISOString())
    .lte('start_at', range.to.toISOString())
    .order('start_at', { ascending: true })

  if (error) {
    console.error('[agenda/service] listAgendaAppointments supabase error', {
      code: (error as { code?: string }).code,
      message: (error as { message?: string }).message,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
      errorRaw: JSON.stringify(error),
    })
    throw new Error(`Supabase query falhou: ${(error as { message?: string }).message ?? JSON.stringify(error)}`)
  }

  console.log('[agenda/service] listAgendaAppointments query ok', { rowCount: (data ?? []).length })

  const mapped = (data ?? []).map((row) => mapAppointmentRow(row as Record<string, unknown>))
  const filtered = filterAppointments(mapped, params)
  const totals = filtered.reduce<Record<string, number>>((acc, item) => {
    const statusKey = item.status ?? 'unknown'
    acc.total = (acc.total ?? 0) + 1
    acc[statusKey] = (acc[statusKey] ?? 0) + 1
    return acc
  }, {})

  const startIndex = (page - 1) * pageSize
  const pagedItems = defaultView(params.view) === 'list' ? filtered.slice(startIndex, startIndex + pageSize) : filtered

  return {
    items: pagedItems,
    meta: {
      view: range.view,
      date: range.anchor,
      date_from: isoDate(range.from),
      date_to: isoDate(range.to),
      page,
      page_size: pageSize,
      total: filtered.length,
      total_pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    },
    totals,
  }
}

async function updateConversationAppointmentStatus(conversationId: string, status: AgendaStatus) {
  const admin = createAdminClient()
  await admin
    .from('conversations')
    .update({
      appointment_status: status,
    })
    .eq('id', conversationId)
}

export async function getAgendaAppointmentById(id: string, clientId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('appointments')
    .select(`
      id,
      conversation_id,
      contact_id,
      title,
      start_at,
      end_at,
      modality,
      status,
      meet_link,
      google_event_id,
      confirmation_sent_at,
      confirmation_response,
      created_at,
      updated_at,
      source,
      sync_status,
      sync_error,
      external_calendar_id,
      external_event_id,
      last_synced_at,
      notes,
      contacts(id, name, phone_number),
      conversations!fk_appointments_conversation!inner(client_id)
    `)
    .eq('id', id)
    .eq('conversations.client_id', clientId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapAppointmentRow(data as Record<string, unknown>)
}

export async function createAgendaAppointment(input: AgendaUpsertInput) {
  const admin = createAdminClient()
  const normalizedStatus = input.status ?? 'scheduled'
  if (!AGENDA_STATUSES.includes(normalizedStatus as AgendaStatus)) {
    throw new Error('Status inválido')
  }

  const context = await ensureContactAndConversation(input)
  const syncResult = await buildSyncResult({
    clientId: input.clientId,
    title: input.title ?? null,
    notes: input.notes ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    contactName: context.contactName,
    contactPhone: context.contactPhone,
    syncToGoogle: input.syncToGoogle,
  })

  const { data, error } = await admin
    .from('appointments')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: context.conversationId,
      contact_id: context.contactId,
      title: input.title ?? null,
      start_at: input.startAt,
      end_at: input.endAt,
      modality: input.modality ?? null,
      status: normalizedStatus,
      meet_link: syncResult.meet_link,
      google_event_id: syncResult.google_event_id,
      source: input.source ?? 'supabase',
      sync_status: syncResult.sync_status,
      sync_error: syncResult.sync_error,
      external_calendar_id: syncResult.external_calendar_id,
      external_event_id: syncResult.external_event_id,
      last_synced_at: syncResult.last_synced_at,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(`
      id,
      conversation_id,
      contact_id,
      title,
      start_at,
      end_at,
      modality,
      status,
      meet_link,
      google_event_id,
      confirmation_sent_at,
      confirmation_response,
      created_at,
      updated_at,
      source,
      sync_status,
      sync_error,
      external_calendar_id,
      external_event_id,
      last_synced_at,
      notes,
      contacts(id, name, phone_number)
    `)
    .single()

  if (error) throw error

  await updateConversationAppointmentStatus(context.conversationId, normalizedStatus)
  return mapAppointmentRow(data as Record<string, unknown>)
}

export async function updateAgendaAppointment(
  id: string,
  clientId: string,
  input: Partial<Omit<AgendaUpsertInput, 'clientId'>>
) {
  const existing = await getAgendaAppointmentById(id, clientId)
  if (!existing) {
    throw new Error('Agendamento não encontrado')
  }

  const admin = createAdminClient()
  const normalizedStatus = input.status ?? existing.status ?? 'scheduled'
  if (!AGENDA_STATUSES.includes(normalizedStatus as AgendaStatus)) {
    throw new Error('Status inválido')
  }
  const safeStatus = normalizedStatus as AgendaStatus

  const syncResult = await buildSyncResult({
    clientId,
    title: input.title ?? existing.title ?? null,
    notes: input.notes ?? existing.notes ?? null,
    startAt: input.startAt ?? existing.start_at,
    endAt: input.endAt ?? existing.end_at,
    contactName: input.contactName ?? existing.contact_name,
    contactPhone: input.contactPhone ?? existing.contact_phone,
    syncToGoogle: input.syncToGoogle,
    existingEventId: existing.external_event_id ?? existing.google_event_id ?? null,
  })

  const { data, error } = await admin
    .from('appointments')
    .update({
      title: input.title ?? existing.title ?? null,
      start_at: input.startAt ?? existing.start_at,
      end_at: input.endAt ?? existing.end_at,
      modality: input.modality ?? existing.modality ?? null,
      status: safeStatus,
      notes: input.notes ?? existing.notes ?? null,
      meet_link: syncResult.meet_link ?? existing.meet_link,
      google_event_id: syncResult.google_event_id ?? existing.google_event_id,
      sync_status: syncResult.sync_status,
      sync_error: syncResult.sync_error,
      external_calendar_id: syncResult.external_calendar_id ?? existing.external_calendar_id,
      external_event_id: syncResult.external_event_id ?? existing.external_event_id,
      last_synced_at: syncResult.last_synced_at ?? existing.last_synced_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      id,
      conversation_id,
      contact_id,
      title,
      start_at,
      end_at,
      modality,
      status,
      meet_link,
      google_event_id,
      confirmation_sent_at,
      confirmation_response,
      created_at,
      updated_at,
      source,
      sync_status,
      sync_error,
      external_calendar_id,
      external_event_id,
      last_synced_at,
      notes,
      contacts(id, name, phone_number)
    `)
    .single()

  if (error) throw error

  await updateConversationAppointmentStatus(existing.conversation_id, safeStatus)
  return mapAppointmentRow(data as Record<string, unknown>)
}

export async function cancelAgendaAppointment(id: string, clientId: string) {
  const existing = await getAgendaAppointmentById(id, clientId)
  if (!existing) {
    throw new Error('Agendamento não encontrado')
  }

  const admin = createAdminClient()
  const { googleConfig } = await getClientConfigs(clientId)
  let syncStatus: AgendaSyncStatus = existing.sync_status ?? 'pending'
  let syncError: string | null = existing.sync_error ?? null

  const calendarForCancel = getCalendarClientForConfig(googleConfig ?? null)
  if (existing.external_event_id && calendarForCancel && googleConfig?.calendar_id) {
    try {
      await calendarForCancel.events.delete({
        calendarId: googleConfig.calendar_id,
        eventId: existing.external_event_id,
      })
      syncStatus = 'synced'
      syncError = null
    } catch (error) {
      syncStatus = 'error'
      syncError = error instanceof Error ? error.message : 'Falha ao cancelar evento no Google Calendar'
    }
  }

  const { data, error } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      sync_status: syncStatus,
      sync_error: syncError,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      id,
      conversation_id,
      contact_id,
      title,
      start_at,
      end_at,
      modality,
      status,
      meet_link,
      google_event_id,
      confirmation_sent_at,
      confirmation_response,
      created_at,
      updated_at,
      source,
      sync_status,
      sync_error,
      external_calendar_id,
      external_event_id,
      last_synced_at,
      notes,
      contacts(id, name, phone_number)
    `)
    .single()

  if (error) throw error

  await updateConversationAppointmentStatus(existing.conversation_id, 'cancelled')
  return mapAppointmentRow(data as Record<string, unknown>)
}

export async function updateAgendaAppointmentStatus(id: string, clientId: string, status: AgendaStatus) {
  const admin = createAdminClient()
  const existing = await getAgendaAppointmentById(id, clientId)
  if (!existing) {
    throw new Error('Agendamento não encontrado')
  }

  const { data, error } = await admin
    .from('appointments')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      id,
      conversation_id,
      contact_id,
      title,
      start_at,
      end_at,
      modality,
      status,
      meet_link,
      google_event_id,
      confirmation_sent_at,
      confirmation_response,
      created_at,
      updated_at,
      source,
      sync_status,
      sync_error,
      external_calendar_id,
      external_event_id,
      last_synced_at,
      notes,
      contacts(id, name, phone_number)
    `)
    .single()

  if (error) throw error

  await updateConversationAppointmentStatus(existing.conversation_id, status)
  return mapAppointmentRow(data as Record<string, unknown>)
}
