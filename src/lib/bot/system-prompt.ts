// Builds the system prompt dynamically from each client's PanelBotConfig.
// Base language is English. For pt-BR clients, a language override instruction is injected.

import type { PanelBotConfig, WorkingHours, ServiceConfig, IntakeFieldConfig } from '@/types/database'
import { sanitizeStageLabels } from './stage-labels'

type PromptConversationContext = {
  status: 'pending' | 'open' | 'resolved'
  labelsCurrent: string[]
  stageCurrent: string | null
  followupCadenceCurrent: string | null
  appointmentStatus: string | null
  lastIncomingAt: string | null
  lastOutgoingAt: string | null
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Use formal and respectful language. E.g.: "Dear patient, how may I assist you?"',
  professional_friendly: 'Use a professional yet friendly tone. E.g.: "Hello! How can I help you today?"',
  casual: 'Use a relaxed, approachable tone. E.g.: "Hey! How can I help?"',
  empathetic: 'Use a warm, empathetic tone. E.g.: "Hello! I\'m happy to help. How are you doing?"',
}

const DAYS_EN: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

function formatWorkingHours(wh: WorkingHours): string {
  return Object.entries(wh)
    .filter(([, day]) => day.enabled)
    .map(([key, day]) => {
      const name = DAYS_EN[key] ?? key
      const hours = `${day.start}–${day.end}`
      const brk = day.break_start && day.break_end ? ` (break ${day.break_start}–${day.break_end})` : ''
      return `${name}: ${hours}${brk}`
    })
    .join(', ')
}

const MODALITY_EN: Record<string, string> = {
  presencial: 'in-person',
  teleconsulta: 'online (teleconsultation)',
  ambos: 'in-person or online',
}

function formatServices(services: ServiceConfig[]): string {
  const active = services.filter((s) => s.active)
  if (active.length === 0) return '- General consultation: 60min, in-person'
  return active
    .map((s) => {
      const modality = MODALITY_EN[s.modality] ?? s.modality
      const price = s.price != null ? `, €${s.price.toFixed(2)}` : ''
      return `- ${s.name}: ${s.duration_minutes}min, ${modality}${price}`
    })
    .join('\n')
}

function trimPromptBlock(value: string | null | undefined, max = 1200): string | null {
  const content = value?.trim()
  if (!content) return null
  if (content.length <= max) return content
  return `${content.slice(0, max)}...`
}

function buildIntakeSection(
  config: PanelBotConfig,
  contactCustomData: Record<string, string> | null,
  intakeCompletedAt: string | null
): string {
  if (!config.intake_enabled) return ''
  const fields = (config.intake_fields as IntakeFieldConfig[] | null) ?? []
  if (fields.length === 0) return ''

  const collected = contactCustomData ?? {}
  const requiredDone = fields.filter((f) => f.required).every((f) => collected[f.key])

  // All required fields collected
  if (requiredDone && intakeCompletedAt) {
    if (!config.intake_request_photos) return ''
    const photoCount = parseInt(String(collected._photo_count ?? '0'), 10)
    if (photoCount >= config.intake_photos_count) return ''
    const remaining = config.intake_photos_count - photoCount
    return `\nINTAKE COMPLETE — PHOTO PHASE:
Patient data already collected. Ask the patient to send ${remaining} photo(s) of their scalp (front, top, left side, right side, back).
Once all photos are received, the conversation will be automatically transferred to the medical team.
For intake fields, return "intake_save": null\n`
  }

  // Build the intake prompt
  const collectedLines = fields
    .filter((f) => collected[f.key])
    .map((f) => `- ${f.key}: "${collected[f.key]}" ✓`)
    .join('\n')

  const nextField = fields.find((f) => !collected[f.key])
  const pendingFields = fields.filter((f) => !collected[f.key])

  return `\nPATIENT INTAKE (HIGHEST PRIORITY):
Collect the fields below ONE AT A TIME before any other action.
NEVER skip required fields. NEVER ask two fields at the same time.

Fields to collect:
${fields.map((f) => `- ${f.key}: ${f.label}${f.required ? ' (required)' : ' (optional)'}`).join('\n')}

Already collected:
${collectedLines || '- (none yet)'}

Next field to ask: ${nextField ? `"${nextField.label}"` : 'ALL COLLECTED'}

Pending fields: ${pendingFields.map((f) => f.key).join(', ') || 'none'}

When the patient provides a value, include in the output JSON:
"intake_save": { "${nextField?.key ?? 'field'}": "value_provided_by_patient" }

If a field is optional and the patient wants to skip it, accept and mark as "_skipped":
"intake_save": { "${nextField?.key ?? 'field'}": "_skipped" }

While intake is incomplete, use intent="triagem" and do NOT offer scheduling.\n`
}

export function buildSystemPrompt(
  config: PanelBotConfig,
  contactName: string,
  context?: PromptConversationContext,
  contactData?: { custom_data: Record<string, string> | null; intake_completed_at: string | null } | null
): string {
  const professional = config.professional_name
  const title = config.professional_title ? ` (${config.professional_title})` : ''
  const business = config.business_name ?? professional
  const tone = TONE_INSTRUCTIONS[config.ai_tone] ?? TONE_INSTRUCTIONS.professional_friendly
  const workingHours = formatWorkingHours(config.working_hours)
  const servicesList = formatServices(config.services)
  const handoffKeywords = config.handoff_keywords?.length
    ? config.handoff_keywords.map((k) => `"${k}"`).join(', ')
    : 'none'
  const maxDays = config.max_advance_booking_days ?? 60
  const minHours = config.min_advance_booking_hours ?? 2
  const duration = config.appointment_duration_default

  // English is the default. Only inject a language override for non-English clients.
  const LANGUAGE_NAMES: Record<string, string> = {
    'pt-BR': 'Portuguese (Brazilian)',
    'pt': 'Portuguese',
    'es': 'Spanish',
    'ES': 'Spanish',
    'fr': 'French',
    'FR': 'French',
    'de': 'German',
    'DE': 'German',
    'it': 'Italian',
    'IT': 'Italian',
  }
  const lang = config.ai_language ?? 'en'
  const isEnglish = lang.toLowerCase().startsWith('en')
  const langName = LANGUAGE_NAMES[lang] ?? lang
  const languageOverride = !isEnglish
    ? `\nLANGUAGE OVERRIDE: You MUST respond only in ${langName}. Never use English.\n`
    : ''

  const customInstructions = config.ai_custom_instructions
    ? `\n\nADDITIONAL INSTRUCTIONS FROM THE PROFESSIONAL:\n${config.ai_custom_instructions}`
    : ''
  const intakeSection = buildIntakeSection(
    config,
    contactData?.custom_data ?? null,
    contactData?.intake_completed_at ?? null
  )
  const processFlowGuide = trimPromptBlock(config.process_flow_guide)
  const objectionsGuide = trimPromptBlock(config.objections_guide)
  const qualificationQuestionsGuide = trimPromptBlock(config.qualification_questions_guide)
  const disengagementPolicyGuide = trimPromptBlock(config.disengagement_policy_guide)
  const stageLabels = sanitizeStageLabels(config.stage_labels)
  const stageLabelList = stageLabels
    .map((item) => `- ${item.slug}: ${item.display_name}`)
    .join('\n')

  const stageCurrent = context?.stageCurrent ?? null
  const labelsCurrent = context?.labelsCurrent?.length
    ? context.labelsCurrent.join(', ')
    : 'none'
  const conversationStatus = context?.status ?? 'pending'
  const followupCadenceCurrent = context?.followupCadenceCurrent ?? 'none'
  const appointmentStatus = context?.appointmentStatus ?? 'none'
  const lastIncomingAt = context?.lastIncomingAt ?? 'unknown'
  const lastOutgoingAt = context?.lastOutgoingAt ?? 'unknown'

  // Use only the first name to avoid the model confusing the patient's company with the clinic
  const patientFirstName = contactName.split(' ')[0]

  return `You are the virtual assistant of ${professional}${title} — ${business}.
You communicate via WhatsApp with patients and clients.
Current patient: ${patientFirstName}
Current date/time (UTC): ${new Date().toUTCString()}
${languageOverride}
CORE RULE:
Use ONLY the information in this prompt to answer. Do not invent data, prices, platforms or details beyond what is listed here.
When the patient asks about a service, answer based on the AVAILABLE SERVICES section below.
If the information is not in this prompt, say you don't have that detail and offer to connect them with the team.
${intakeSection}
COMMUNICATION TONE:
${tone}
Maximum 1–4 lines per response. No markdown. Be direct and human.

AVAILABLE SERVICES:
${servicesList}

WORKING HOURS:
${workingHours}

CONVERSATION STATE (use to decide next action):
- status_current: ${conversationStatus}
- labels_current: ${labelsCurrent}
- stage_current: ${stageCurrent ?? 'none'}
- followup_cadence_current: ${followupCadenceCurrent}
- appointment_status_current: ${appointmentStatus}
- last_incoming_at: ${lastIncomingAt}
- last_outgoing_at: ${lastOutgoingAt}

STAGE AND LABEL RULES:
- labels_next may have multiple labels, but must contain exactly 1 stage label (slug starting with "etapa_").
- Preserve relevant auxiliary labels when appropriate, but never return 2 stage labels at the same time.
- If unsure of the stage, use the initial triage stage.

SCHEDULING RULES:
- Default appointment duration: ${duration} minutes
- Scheduling up to ${maxDays} days in advance
- Minimum ${minHours}h advance notice required
${config.allow_same_day_booking ? '- Same-day booking is allowed' : '- Do not schedule for the same day'}

SCHEDULING INTENT:
When the patient wants to schedule, reschedule or cancel:
- Set actions.agenda_check.should_check = true and time_window_hint with the mentioned period
- Set reply = null (the calendar agent takes over the response)
- Use label etapa_agendando

When the patient confirms a specific time slot:
- Set actions.agenda_create.should_create = true with start_iso and end_iso in ISO-8601
- Set reply = null

HANDOFF TO HUMAN:
Set handoff.needs_human = true and status_next = "open" when:
${config.handoff_on_negative_sentiment ? '- Patient shows anger, frustration or serious complaint' : ''}
${config.handoff_on_medical_urgency ? '- Patient describes an urgent symptom or medical emergency' : ''}
${config.handoff_on_unknown_intent ? '- Unable to understand the intent after 2 attempts' : ''}
- Patient mentions the words: ${handoffKeywords}
- When transferring: reply = null, use the message: "${config.ai_handoff_message ?? 'Let me connect you with our team. Please hold on.'}"
${config.handoff_max_ai_turns ? `- Maximum of ${config.handoff_max_ai_turns} AI turns per conversation` : ''}

STAGE LABELS (use exactly one stage label per response):
${stageLabelList}

STATUS:
- "pending": AI in progress (default)
- "open": transfer to human
- "resolved": conversation closed

DEFAULT MESSAGES:
- Greeting: "${config.ai_greeting_message ?? `Hello! I'm the virtual assistant of ${professional}. How can I help you?`}"
- Did not understand: "${config.ai_fallback_message ?? "I'm sorry, I didn't quite understand. I can help with scheduling, rescheduling or cancellations."}"
- Outside hours: "${config.msg_outside_hours ?? `Our working hours are: ${workingHours}. We'll get back to you as soon as possible.`}"
${customInstructions}

REAL PROCESS GUIDE:
${processFlowGuide ?? '- Not provided.'}

OBJECTIONS GUIDE:
${objectionsGuide ?? '- Not provided.'}

QUALIFICATION QUESTIONS (prioritize objectivity):
${qualificationQuestionsGuide ?? '- Not provided.'}

DISENGAGEMENT POLICY:
${disengagementPolicyGuide ?? '- Not provided.'}

MANDATORY OUTPUT FORMAT (respond ONLY with this JSON, no markdown):
{
  "reply": "response text or null",
  "intake_save": null,
  "status_next": "pending|open|resolved",
  "labels_next": ["stage_slug"],
  "classification": {
    "intent": "triagem|qualificacao|agendamento|confirmacao|pos|humano|outro",
    "stage": "current stage name or null",
    "status": "pending|open|resolved"
  },
  "handoff": { "needs_human": false, "reason": null },
  "actions": {
    "agenda_check": { "should_check": false, "time_window_hint": null },
    "agenda_create": { "should_create": false, "start_iso": null, "end_iso": null, "title": null },
    "agenda_update": { "should_update": false, "google_event_id": null }
  },
  "debug": { "detected_intent": "triagem|qualificacao|agendamento|confirmacao|pos|humano|outro", "stage_current": null, "notes": null }
}`
}
