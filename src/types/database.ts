// Tipos das tabelas panel_* do Supabase

export type ClientStatus =
  | 'draft'
  | 'pending_whatsapp'
  | 'pending_google'
  | 'configuring'
  | 'active'
  | 'paused'
  | 'disconnected'

export type AiTone = 'formal' | 'professional_friendly' | 'casual' | 'empathetic'

export type BusinessSegment =
  | 'medicina'
  | 'odontologia'
  | 'psicologia'
  | 'fisioterapia'
  | 'estetica'
  | 'outro'

export type ServiceModality = 'presencial' | 'teleconsulta' | 'ambos'

export type ConnectionStatus = 'open' | 'connecting' | 'disconnected'

export type OnboardingStep = 'none' | 'whatsapp' | 'google' | 'config' | 'done'

export type HealthCheckService = 'whatsapp' | 'google_calendar' | 'chatwoot'

export type HealthCheckStatus = 'ok' | 'warning' | 'error'

// --- Panel Clients ---

export interface PanelClient {
  id: string
  name: string
  owner_name: string
  phone: string | null
  email: string
  status: ClientStatus
  created_at: string
  updated_at: string
}

export type PanelClientInsert = Omit<PanelClient, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  status?: ClientStatus
}

export type PanelClientUpdate = Partial<Omit<PanelClient, 'id' | 'created_at'>>

// --- Panel WhatsApp Config ---

export interface PanelWhatsAppConfig {
  id: string
  client_id: string
  evolution_instance_name: string
  evolution_instance_id: string | null
  evolution_instance_token: string | null
  connection_status: ConnectionStatus
  connected_phone: string | null
  connected_at: string | null
  disconnected_at: string | null
  webhook_url: string | null
  chatwoot_inbox_id: number | null
  chatwoot_account_id: number | null
  chatwoot_agent_token: string | null
  created_at: string
  updated_at: string
}

export type PanelWhatsAppConfigInsert = Omit<PanelWhatsAppConfig, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  connection_status?: ConnectionStatus
}

export type PanelWhatsAppConfigUpdate = Partial<Omit<PanelWhatsAppConfig, 'id' | 'client_id' | 'created_at'>>

// --- Panel Google Config ---

export interface PanelGoogleConfig {
  id: string
  client_id: string
  google_email: string | null
  calendar_id: string | null
  access_token: string | null
  refresh_token: string | null
  token_expiry: string | null
  scopes: string[]
  authorized_at: string | null
  created_at: string
  updated_at: string
}

export type PanelGoogleConfigInsert = Omit<PanelGoogleConfig, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type PanelGoogleConfigUpdate = Partial<Omit<PanelGoogleConfig, 'id' | 'client_id' | 'created_at'>>

// --- Service (JSON field in bot config) ---

export interface ServiceConfig {
  name: string
  duration_minutes: number
  modality: ServiceModality
  price: number | null
  active: boolean
}

// --- Working Hours (JSON field in bot config) ---

export interface DaySchedule {
  enabled: boolean
  start: string
  end: string
  break_start: string | null
  break_end: string | null
}

export type WorkingHours = {
  [key in 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday']: DaySchedule
}

// --- Panel Bot Config ---

export interface PanelBotConfig {
  id: string
  client_id: string

  // Perfil do profissional
  professional_name: string
  professional_title: string | null
  professional_register: string | null
  business_name: string | null
  business_segment: BusinessSegment | null
  business_address: string | null
  business_phone: string | null

  // Serviços
  services: ServiceConfig[]

  // Horários
  working_hours: WorkingHours
  appointment_duration_default: number
  appointment_buffer_minutes: number | null
  max_advance_booking_days: number | null
  min_advance_booking_hours: number | null
  allow_same_day_booking: boolean

  // IA
  ai_greeting_message: string | null
  ai_tone: AiTone
  ai_language: string
  ai_custom_instructions: string | null
  ai_fallback_message: string | null
  ai_handoff_message: string | null

  // Follow-up
  followup_enabled: boolean
  followup_confirmation_hours_before: number | null
  followup_reminder_hours_before: number | null
  followup_noshow_enabled: boolean
  msg_confirmation: string | null
  msg_reminder: string | null
  msg_noshow: string | null
  msg_outside_hours: string | null

  // Handoff
  handoff_on_negative_sentiment: boolean
  handoff_on_medical_urgency: boolean
  handoff_on_unknown_intent: boolean
  handoff_max_ai_turns: number | null
  handoff_keywords: string[]

  // Calendar
  calendar_event_title_template: string | null
  calendar_event_description_template: string | null
  calendar_create_meet_link: boolean
  calendar_send_invite_to_patient: boolean
  calendar_color_id: string | null

  // Chatwoot
  chatwoot_auto_resolve_hours: number | null
  chatwoot_working_hours_enabled: boolean
  chatwoot_assign_to_agent_id: number | null

  created_at: string
  updated_at: string
}

export type PanelBotConfigInsert = Omit<PanelBotConfig, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type PanelBotConfigUpdate = Partial<Omit<PanelBotConfig, 'id' | 'client_id' | 'created_at'>>

// --- Panel Health Checks ---

export interface PanelHealthCheck {
  id: string
  client_id: string
  service: HealthCheckService
  status: HealthCheckStatus
  details: string | null
  response_time_ms: number | null
  checked_at: string
}

// --- Panel Audit Log ---

export interface PanelAuditLog {
  id: string
  admin_email: string
  action: string
  client_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

// --- Client with relations (for dashboard/detail views) ---

export interface PanelClientWithRelations extends PanelClient {
  panel_whatsapp_config: PanelWhatsAppConfig | null
  panel_google_config: PanelGoogleConfig | null
  panel_bot_config: PanelBotConfig | null
}
