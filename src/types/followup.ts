// Types for Central Operacional (Followup)

export type CadenceType = 'lead' | 'atendimento' | 'agendado'

export interface FollowupSuppression {
  id: string
  conversation_id: string
  client_id: string
  cadence_type: CadenceType
  suppressed_at: string
  suppressed_by: string
  reason?: string
  released_at?: string | null
}

export interface FollowupConversation {
  conversation_id: string
  contact_name: string
  contact_phone: string
  cadence_type: CadenceType
  current_step: string
  current_step_label: string
  step_sent_at: string
  total_attempts: number
  waiting_response: boolean
  last_incoming_at: string
  last_outgoing_at: string
  last_message_preview: string
  stage: string
}

export interface FollowupTreeNode {
  cadence: CadenceType
  steps: Array<{
    step_key: string
    label: string
  }>
}

export interface FollowupConversationsResponse {
  summary: Record<string, unknown>
  tree: FollowupTreeNode[]
  conversations: FollowupConversation[]
  pagination: {
    page: number
    perPage: number
    total: number
  }
}

export type FollowupStatus = 'all' | 'waiting_response' | 'responded'

export interface FollowupTarget {
  conversation_id: string
  contact_id: string
  contact_name: string
  contact_phone: string
  stage: string
  active_cadence: CadenceType | null
}

export type FollowupEventType =
  | 'followup_sent'
  | 'followup_cancelled'
  | 'followup_triggered_manual'
  | 'followup_skipped'
  | 'followup_error'
