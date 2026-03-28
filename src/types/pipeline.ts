import type { StageLabelConfig } from '@/types/database'

export interface PipelineAppointment {
  id: string
  start_at: string
  end_at: string
  status: string | null
  meet_link: string | null
}

export interface PipelineConversation {
  id: string
  chatwoot_conversation_id: number
  contact_name: string | null
  contact_phone: string | null
  contact_identifier: string | null
  status: 'pending' | 'open' | 'resolved'
  stage_slug: string
  labels: string[]
  last_incoming_at: string | null
  last_outgoing_at: string | null
  followup_cadence: string | null
  appointment_status: string | null
  appointment: PipelineAppointment | null
}

export interface PipelineData {
  columns: StageLabelConfig[]
  conversations: PipelineConversation[]
  chatwootAccountId?: number | null
}

export interface AgendaAppointment {
  id: string
  conversation_id: string
  contact_name: string | null
  contact_phone: string | null
  title: string | null
  start_at: string
  end_at: string
  modality: string | null
  status: string | null
  meet_link: string | null
  google_event_id: string
  confirmation_sent_at: string | null
  confirmation_response: string | null
  created_at: string
}
