import type { PanelBotConfigInsert, IntakeFieldConfig, ServiceConfig } from '@/types/database'
import { DEFAULT_STAGE_LABELS, DEFAULT_STORE_STAGE_LABELS } from '@/lib/bot/stage-labels'
import type { OnboardingDraft, HandoffReason } from '@/types/onboarding'

// ── Label maps ────────────────────────────────────────────────────────────────

const INTAKE_FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome completo',
  phone: 'Telefone',
  email: 'E-mail',
  date_of_birth: 'Data de nascimento',
  city: 'Cidade',
  referral_source: 'Como nos conheceu',
  chief_complaint: 'Motivo da consulta',
  medications: 'Medicações em uso',
}

// Fields that are always required when intake is on
const ALWAYS_REQUIRED = new Set(['full_name', 'phone'])

// ── Handoff keyword seeds ─────────────────────────────────────────────────────

const HANDOFF_KEYWORDS: Record<HandoffReason, string[]> = {
  negative_sentiment: [],
  medical_urgency: [],
  unknown_intent: [],
  user_request: ['quero falar com atendente', 'atendente', 'pessoa real', 'humano'],
  price_negotiation: ['desconto', 'negociar', 'preço', 'valor'],
  complaint: ['reclamação', 'insatisfeito', 'péssimo', 'absurdo'],
}

// ── Main mapper ───────────────────────────────────────────────────────────────

/**
 * Transforms an OnboardingDraft (guided frontend state) into a
 * PanelBotConfigInsert payload ready for POST /api/bot-config.
 * The API contract remains unchanged — this function is the only
 * place that knows about the mapping logic.
 */
export function mapOnboardingDraftToPanelBotConfig(
  clientId: string,
  draft: OnboardingDraft
): PanelBotConfigInsert {
  const { business, goals, flow, scheduling, services, followupModes, workingHours } = draft

  // ── Intake fields ──────────────────────────────────────────────────────────
  const intakeFields: IntakeFieldConfig[] = flow.requiresIntake
    ? flow.intakeFields.map((key) => ({
        key,
        label: INTAKE_FIELD_LABELS[key] ?? key,
        required: ALWAYS_REQUIRED.has(key),
      }))
    : []

  // ── Services ───────────────────────────────────────────────────────────────
  const mappedServices: ServiceConfig[] = services
    .filter((s) => s.name.trim())
    .map((s) => ({
      name: s.name.trim(),
      duration_minutes: s.duration_minutes,
      modality: s.modality,
      price: null,
      active: true,
    }))

  // ── Handoff keywords ───────────────────────────────────────────────────────
  const handoffKeywords = flow.handoffReasons.flatMap(
    (r) => HANDOFF_KEYWORDS[r] ?? []
  )

  // ── Custom instructions derived from goals ────────────────────────────────
  // goals.supports has no dedicated DB flag; it is surfaced via custom
  // instructions so the AI prompt reflects the intent.
  const ai_custom_instructions: string | null = goals.supports
    ? 'O bot deve atender dúvidas e acompanhar o paciente após o atendimento, respondendo questões pós-consulta com atenção e cuidado.'
    : null

  return {
    client_id: clientId,

    // ── Profile ──────────────────────────────────────────────────────────────
    professional_name: business.professionalName,
    professional_title: business.professionalTitle || null,
    professional_register: null,
    business_name: business.businessName || null,
    business_segment: business.segment || null,
    business_address: null,
    business_phone: business.phone || null,

    // ── Services ─────────────────────────────────────────────────────────────
    services: mappedServices,
    stage_labels: business.segment === 'loja' ? DEFAULT_STORE_STAGE_LABELS : DEFAULT_STAGE_LABELS,

    // ── Working hours ─────────────────────────────────────────────────────────
    working_hours: workingHours,
    appointment_duration_default: scheduling.defaultDuration,
    appointment_buffer_minutes: scheduling.bufferMinutes,
    max_advance_booking_days: scheduling.maxAdvanceDays,
    min_advance_booking_hours: scheduling.minAdvanceHours,
    allow_same_day_booking: scheduling.sameDayBooking,

    // ── AI behaviour ─────────────────────────────────────────────────────────
    ai_greeting_message: null,
    ai_tone: business.tone,
    ai_language: business.language,
    ai_custom_instructions,
    process_flow_guide: null,
    objections_guide: null,
    qualification_questions_guide: null,
    disengagement_policy_guide: null,
    ai_fallback_message: null,
    ai_handoff_message: null,

    // ── Intake ────────────────────────────────────────────────────────────────
    intake_enabled: flow.requiresIntake,
    intake_fields: intakeFields,
    intake_request_photos: flow.asksForMedia,
    intake_photos_count: flow.asksForMedia ? 3 : 0,
    intake_handoff_after_photos: flow.asksForMedia,
    intake_photo_guide_url: null,

    // ── Timezone ──────────────────────────────────────────────────────────────
    timezone: 'America/Sao_Paulo',

    // ── Follow-up ─────────────────────────────────────────────────────────────
    followup_enabled: followupModes.appointment,
    followup_confirmation_hours_before: 24,
    followup_reminder_hours_before: 2,
    followup_noshow_enabled: followupModes.appointment,
    msg_confirmation: null,
    msg_reminder: null,
    msg_noshow: null,
    msg_outside_hours: null,
    lead_followup_enabled: followupModes.lead,
    lead_followup_msg_d1: null,
    lead_followup_msg_d2: null,
    lead_followup_msg_d3: null,
    lead_followup_msg_d5: null,
    lead_followup_msg_d7: null,
    atendimento_followup_enabled: followupModes.attendance,
    atendimento_followup_msg_d1: null,
    atendimento_followup_msg_d2: null,
    atendimento_followup_msg_d4: null,
    atendimento_followup_msg_d7: null,
    atendimento_followup_msg_d10: null,
    agendado_followup_msg_d2: null,
    agendado_followup_msg_minus3h: null,
    agendado_followup_msg_minus5min: null,

    // ── Handoff ───────────────────────────────────────────────────────────────
    handoff_on_negative_sentiment: flow.handoffReasons.includes('negative_sentiment'),
    handoff_on_medical_urgency: flow.handoffReasons.includes('medical_urgency'),
    handoff_on_unknown_intent: flow.handoffReasons.includes('unknown_intent'),
    handoff_max_ai_turns: 20,
    handoff_keywords: handoffKeywords,

    // ── Calendar ─────────────────────────────────────────────────────────────
    calendar_event_title_template: null,
    calendar_event_description_template: null,
    calendar_create_meet_link: false,
    calendar_send_invite_to_patient: false,
    calendar_color_id: null,
    agenda_recipient_email: null,

    // ── Chatwoot ──────────────────────────────────────────────────────────────
    chatwoot_auto_resolve_hours: 24,
    chatwoot_working_hours_enabled: true,
    chatwoot_assign_to_agent_id: null,
  }
}
