import { z } from 'zod/v4'

const aiToneValues = ['formal', 'professional_friendly', 'casual', 'empathetic'] as const
const businessSegmentValues = ['medicina', 'odontologia', 'psicologia', 'fisioterapia', 'estetica', 'outro'] as const
const serviceModalityValues = ['presencial', 'teleconsulta', 'ambos'] as const

const serviceSchema = z.object({
  name: z.string().min(1, 'Nome do servico e obrigatorio'),
  duration_minutes: z.number().int().min(5).max(480),
  modality: z.enum(serviceModalityValues),
  price: z.number().min(0).nullable(),
  active: z.boolean(),
})

const stageLabelSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug da etapa é obrigatório')
    .regex(/^[a-z0-9_]+$/, 'Slug deve usar apenas letras minúsculas, números e _'),
  display_name: z.string().min(1, 'Nome amigável da etapa é obrigatório'),
})

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  break_start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  break_end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
})

const workingHoursSchema = z.object({
  monday: dayScheduleSchema,
  tuesday: dayScheduleSchema,
  wednesday: dayScheduleSchema,
  thursday: dayScheduleSchema,
  friday: dayScheduleSchema,
  saturday: dayScheduleSchema,
  sunday: dayScheduleSchema,
})

export const botConfigInsertSchema = z.object({
  client_id: z.uuid(),

  // Perfil
  professional_name: z.string().min(1, 'Nome do profissional e obrigatorio'),
  professional_title: z.string().nullable().optional(),
  professional_register: z.string().nullable().optional(),
  business_name: z.string().nullable().optional(),
  business_segment: z.enum(businessSegmentValues).nullable().optional(),
  business_address: z.string().nullable().optional(),
  business_phone: z.string().nullable().optional(),

  // Servicos
  services: z.array(serviceSchema).default([]),
  stage_labels: z
    .array(stageLabelSchema)
    .min(1, 'Informe ao menos uma etapa')
    .refine(
      (items) => new Set(items.map((item) => item.slug)).size === items.length,
      'Não pode haver slugs de etapa duplicados'
    )
    .default([{ slug: 'etapa_triagem', display_name: 'Triagem' }]),

  // Horarios
  working_hours: workingHoursSchema,
  appointment_duration_default: z.number().int().min(5).max(480).default(60),
  appointment_buffer_minutes: z.number().int().min(0).nullable().optional(),
  max_advance_booking_days: z.number().int().min(1).nullable().optional(),
  min_advance_booking_hours: z.number().int().min(0).nullable().optional(),
  allow_same_day_booking: z.boolean().default(true),

  // IA
  ai_greeting_message: z.string().nullable().optional(),
  ai_tone: z.enum(aiToneValues).default('professional_friendly'),
  ai_language: z.string().default('pt-BR'),
  ai_custom_instructions: z.string().nullable().optional(),
  process_flow_guide: z.string().max(4000).nullable().optional(),
  objections_guide: z.string().max(4000).nullable().optional(),
  qualification_questions_guide: z.string().max(4000).nullable().optional(),
  disengagement_policy_guide: z.string().max(4000).nullable().optional(),
  ai_fallback_message: z.string().nullable().optional(),
  ai_handoff_message: z.string().nullable().optional(),

  // Follow-up
  followup_enabled: z.boolean().default(true),
  followup_confirmation_hours_before: z.number().int().nullable().optional(),
  followup_reminder_hours_before: z.number().int().nullable().optional(),
  followup_noshow_enabled: z.boolean().default(true),
  msg_confirmation: z.string().nullable().optional(),
  msg_reminder: z.string().nullable().optional(),
  msg_noshow: z.string().nullable().optional(),
  msg_outside_hours: z.string().nullable().optional(),
  lead_followup_enabled: z.boolean().nullable().optional(),
  lead_followup_msg_d1: z.string().nullable().optional(),
  lead_followup_msg_d2: z.string().nullable().optional(),
  lead_followup_msg_d3: z.string().nullable().optional(),
  lead_followup_msg_d5: z.string().nullable().optional(),
  lead_followup_msg_d7: z.string().nullable().optional(),
  atendimento_followup_enabled: z.boolean().nullable().optional(),
  atendimento_followup_msg_d1: z.string().nullable().optional(),
  atendimento_followup_msg_d2: z.string().nullable().optional(),
  atendimento_followup_msg_d4: z.string().nullable().optional(),
  atendimento_followup_msg_d7: z.string().nullable().optional(),
  atendimento_followup_msg_d10: z.string().nullable().optional(),
  agendado_followup_msg_d2: z.string().nullable().optional(),
  agendado_followup_msg_minus3h: z.string().nullable().optional(),
  agendado_followup_msg_minus5min: z.string().nullable().optional(),

  // Handoff
  handoff_on_negative_sentiment: z.boolean().default(true),
  handoff_on_medical_urgency: z.boolean().default(true),
  handoff_on_unknown_intent: z.boolean().default(false),
  handoff_max_ai_turns: z.number().int().nullable().optional(),
  handoff_keywords: z.array(z.string()).default([]),

  // Calendar
  calendar_event_title_template: z.string().nullable().optional(),
  calendar_event_description_template: z.string().nullable().optional(),
  calendar_create_meet_link: z.boolean().default(false),
  calendar_send_invite_to_patient: z.boolean().default(false),
  calendar_color_id: z.string().nullable().optional(),

  // Chatwoot
  chatwoot_auto_resolve_hours: z.number().int().nullable().optional(),
  chatwoot_working_hours_enabled: z.boolean().default(true),
  chatwoot_assign_to_agent_id: z.number().int().nullable().optional(),
})

export const botConfigUpdateSchema = botConfigInsertSchema
  .omit({ client_id: true })
  .partial()

export type BotConfigInsert = z.infer<typeof botConfigInsertSchema>
export type BotConfigUpdate = z.infer<typeof botConfigUpdateSchema>

export { serviceSchema, dayScheduleSchema, workingHoursSchema }
