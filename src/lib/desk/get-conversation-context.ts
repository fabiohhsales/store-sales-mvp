// ── Conversation Context Aggregator ──────────────────────────────────────────
// Consolidates data from conversations, contacts, appointments, bot config,
// and conversation_events into a single ConversationContext view-model.

import { createAdminClient } from '@/lib/supabase/admin'
import { deriveConductionMode, slaColor } from './conduction'
import type {
  ConversationContext,
  IntakeStatus,
  AppointmentContextStatus,
  FollowupContextStatus,
  SlaStatus,
  ContextAlert,
  IntakeField,
  ContextEvent,
} from '@/types/conversation-context'
import type { IntakeFieldConfig } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveIntakeStatus(
  intakeEnabled: boolean,
  intakeFields: IntakeFieldConfig[],
  customData: Record<string, string> | null,
  intakeCompletedAt: string | null
): IntakeStatus {
  if (!intakeEnabled || intakeFields.length === 0) return 'empty'
  if (intakeCompletedAt) return 'completed'
  if (!customData) return 'empty'
  const filled = intakeFields.filter((f) => customData[f.key]?.trim())
  return filled.length === 0 ? 'empty' : 'partial'
}

function resolveIntakeFields(
  intakeFields: IntakeFieldConfig[],
  customData: Record<string, string> | null
): { required: IntakeField[]; collected: IntakeField[]; missing: IntakeField[] } {
  const required: IntakeField[] = []
  const collected: IntakeField[] = []
  const missing: IntakeField[] = []

  for (const f of intakeFields) {
    const value = customData?.[f.key]?.trim() || null
    const field: IntakeField = { key: f.key, label: f.label, required: f.required, value }
    if (f.required) required.push(field)
    if (value) collected.push(field)
    else missing.push(field)
  }
  return { required, collected, missing }
}

function resolveAppointmentStatus(
  status: string | null | undefined
): AppointmentContextStatus {
  if (!status) return 'none'
  const map: Record<string, AppointmentContextStatus> = {
    scheduled: 'scheduled',
    confirmed: 'scheduled',
    rescheduled: 'rescheduled',
    cancelled: 'cancelled',
    noshow: 'noshow',
    attended: 'none',
  }
  return map[status] ?? 'pending'
}

function resolveFollowupStatus(
  cadence: string | null,
  lastFollowupAt: string | null
): FollowupContextStatus {
  if (!cadence) return 'none'
  if (lastFollowupAt) return 'sent'
  return 'scheduled'
}

function resolveSlaStatus(stageChangedAt: string | null): SlaStatus {
  const color = slaColor(stageChangedAt)
  const map: Record<string, SlaStatus> = { green: 'ok', amber: 'warning', red: 'late' }
  return map[color] ?? 'ok'
}

function buildAlerts(
  intakeStatus: IntakeStatus,
  appointmentStatus: AppointmentContextStatus,
  stage: string,
  lastIncomingAt: string | null
): ContextAlert[] {
  const alerts: ContextAlert[] = []

  if (stage === 'awaiting_human') {
    const wait = lastIncomingAt
      ? Math.round((Date.now() - new Date(lastIncomingAt).getTime()) / 60000)
      : null
    if (wait && wait > 60) {
      alerts.push({
        code: 'long_wait',
        severity: 'warning',
        message: `Paciente aguardando há ${wait} min`,
      })
    }
  }

  if (intakeStatus === 'partial') {
    alerts.push({
      code: 'intake_incomplete',
      severity: 'info',
      message: 'Dados do intake incompletos',
    })
  }

  if (appointmentStatus === 'noshow') {
    alerts.push({
      code: 'appointment_noshow',
      severity: 'warning',
      message: 'Paciente não compareceu ao agendamento',
    })
  }

  return alerts
}

function buildCollectedDataSummary(
  collected: IntakeField[]
): string[] {
  return collected
    .filter((f) => f.value)
    .map((f) => `${f.label}: ${f.value}`)
}

// ── Main aggregator ──────────────────────────────────────────────────────────

export async function getConversationContext(
  conversationId: string,
  clientId: string
): Promise<ConversationContext | null> {
  const admin = createAdminClient()

  // Parallel queries
  const [convResult, eventsResult, botConfigResult] = await Promise.all([
    admin
      .from('conversations')
      .select(`
        id, stage, status, labels, summary, last_intent,
        assigned_operator_id, last_incoming_at, last_outgoing_at, stage_changed_at,
        client_id, contact_id, followup_cadence, last_followup_at,
        appointment_status,
        journey_stage, handoff_reason_code, handoff_reason_label,
        handoff_transferred_at, handoff_returned_to_bot_at, last_system_action,
        contacts ( id, name, phone_number, identifier, custom_data, intake_completed_at )
      `)
      .eq('id', conversationId)
      .maybeSingle(),
    admin
      .from('conversation_events')
      .select('id, event_type, event_source, payload, created_by, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('panel_bot_config')
      .select('intake_enabled, intake_fields')
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  const conv = convResult.data
  if (!conv) return null

  // Supabase may return the joined relation as an object or array depending on cardinality
  const rawContacts = conv.contacts
  const contactRow = Array.isArray(rawContacts) ? rawContacts[0] : rawContacts
  const contact = (contactRow as {
    id: string
    name: string | null
    phone_number: string | null
    identifier: string | null
    custom_data: Record<string, string> | null
    intake_completed_at: string | null
  } | undefined) ?? null

  const intakeEnabled = botConfigResult.data?.intake_enabled ?? false
  const intakeFields: IntakeFieldConfig[] = (botConfigResult.data?.intake_fields as IntakeFieldConfig[]) ?? []
  const customData = contact?.custom_data ?? null

  // Resolve intake
  const intakeStatus = resolveIntakeStatus(intakeEnabled, intakeFields, customData, contact?.intake_completed_at ?? null)
  const { required, collected, missing } = resolveIntakeFields(intakeFields, customData)

  // Appointment (latest for this contact)
  let appointment: ConversationContext['appointment'] = null
  if (contact?.id) {
    const { data: appt } = await admin
      .from('appointments')
      .select('id, title, start_at, end_at, modality, status, meet_link')
      .eq('contact_id', contact.id)
      .order('start_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (appt) {
      const start = new Date(appt.start_at)
      const end = new Date(appt.end_at)
      appointment = {
        id: appt.id,
        serviceName: appt.title,
        date: start.toISOString().slice(0, 10),
        time: start.toTimeString().slice(0, 5),
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
        modality: appt.modality,
        status: appt.status,
        meetLink: appt.meet_link,
      }
    }
  }

  // History (other conversations for same contact)
  let previousConversationsCount = 0
  let lastConversationAt: string | null = null
  let previousAppointmentsCount = 0
  let lastAppointmentAt: string | null = null

  if (contact?.id) {
    const [histConv, histAppt] = await Promise.all([
      admin
        .from('conversations')
        .select('id, created_at')
        .eq('contact_id', contact.id)
        .neq('id', conversationId)
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('appointments')
        .select('id, start_at')
        .eq('contact_id', contact.id)
        .order('start_at', { ascending: false })
        .limit(50),
    ])

    previousConversationsCount = histConv.data?.length ?? 0
    lastConversationAt = histConv.data?.[0]?.created_at ?? null
    previousAppointmentsCount = histAppt.data?.length ?? 0
    lastAppointmentAt = histAppt.data?.[0]?.start_at ?? null
  }

  // Derived values
  const stage = conv.stage ?? 'bot_triage'
  const conductionMode = deriveConductionMode(stage)
  const sla = resolveSlaStatus(conv.stage_changed_at)
  const appointmentCtxStatus = resolveAppointmentStatus(conv.appointment_status ?? appointment?.status)
  const followupStatus = resolveFollowupStatus(conv.followup_cadence, conv.last_followup_at)
  const alerts = buildAlerts(intakeStatus, appointmentCtxStatus, stage, conv.last_incoming_at)
  const collectedSummary = buildCollectedDataSummary(collected)

  const recentEvents: ContextEvent[] = (eventsResult.data ?? []).map((e) => ({
    id: e.id,
    event_type: e.event_type,
    event_source: e.event_source,
    payload: e.payload as Record<string, unknown> | null,
    created_by: e.created_by,
    created_at: e.created_at,
  }))

  return {
    conversationId: conv.id,
    contactId: contact?.id ?? null,
    clientId: conv.client_id,

    header: {
      contactName: contact?.name ?? null,
      contactPhone: contact?.phone_number ?? null,
      conversationShortId: conv.id.slice(0, 8),
      stage,
      journeyStage: conv.journey_stage,
      conductionMode,
      lastMessageAt: conv.last_incoming_at ?? conv.last_outgoing_at ?? null,
      slaStatus: sla,
    },

    summary: {
      contactReason: conv.summary ?? null,
      currentIntent: conv.last_intent ?? null,
      collectedDataSummary: collectedSummary,
      handoffReason: conv.handoff_reason_label ?? null,
      nextStepSuggested: null, // future: AI-driven suggestion
      alerts,
    },

    operational: {
      intakeStatus,
      appointmentStatus: appointmentCtxStatus,
      followupStatus,
      lastSystemAction: conv.last_system_action ?? null,
    },

    appointment,

    intake: {
      completionStatus: intakeStatus,
      requiredFields: required,
      collectedFields: collected,
      missingFields: missing,
      completedAt: contact?.intake_completed_at ?? null,
    },

    handoff: {
      isHandoff: stage === 'awaiting_human' || stage === 'in_service',
      reasonCode: conv.handoff_reason_code ?? null,
      reasonLabel: conv.handoff_reason_label ?? null,
      transferredAt: conv.handoff_transferred_at ?? null,
      returnedToBotAt: conv.handoff_returned_to_bot_at ?? null,
    },

    history: {
      previousConversationsCount,
      previousAppointmentsCount,
      lastConversationAt,
      lastAppointmentAt,
    },

    recentEvents,
  }
}
