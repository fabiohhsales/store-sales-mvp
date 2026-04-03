import type { StageLabelConfig } from '@/types/database'

export interface PipelineAppointment {
  id: string
  start_at: string
  end_at: string
  status: string | null
  meet_link: string | null
}

export interface PipelineBoardConversation {
  id: string
  chatwoot_conversation_id: number | null
  contact_name: string | null
  contact_phone: string | null
  contact_identifier: string | null
  status: 'pending' | 'open' | 'resolved'
  stage_slug: string
  labels: string[]
  last_incoming_at: string | null
  last_outgoing_at: string | null
  stage_entered_at: string | null
  followup_cadence: string | null
  summary: string | null
  intake_fields_filled: number
  intake_fields_total: number
  temperature: 'hot' | 'warm' | 'cold'
  appointment_status: string | null
  appointment: PipelineAppointment | null
}

export interface PipelineBoardData {
  columns: StageLabelConfig[]
  conversations: PipelineBoardConversation[]
  chatwootAccountId?: number | null
}

export type PipelineConversation = PipelineBoardConversation
export type PipelineData = PipelineBoardData

export interface AgendaAppointment {
  id: string
  conversation_id: string
  contact_id: string | null
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
  updated_at: string | null
  source: string
  sync_status: 'disabled' | 'pending' | 'synced' | 'error'
  sync_error: string | null
  external_calendar_id: string | null
  external_event_id: string | null
  last_synced_at: string | null
  notes: string | null
}
