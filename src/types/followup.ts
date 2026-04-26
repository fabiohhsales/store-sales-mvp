export type CadenceType = 'lead' | 'atendimento' | 'agendado'
export type FollowupStatusFilter = 'all' | 'waiting_response' | 'responded'

export interface FollowupOverviewSummary {
  activeFlows: number
  sentStepsInWindow: number
  waitingResponseConversations: number
  waitingResponseAttempts: number
  windowDays: number
  unresolvedAlerts?: number
  deliveryTotal?: number
  deliveryTracked?: number
  deliveryRate?: number | null
}

export interface FollowupTreeStep {
  step_key: string
  label: string
  count: number
}

export interface FollowupTreeNode {
  cadence: CadenceType
  label: string
  count: number
  steps: FollowupTreeStep[]
}

export interface FollowupConversation {
  conversation_id: string
  contact_id: string | null
  client_id: string
  contact_name: string
  contact_phone: string
  cadence_type: CadenceType
  current_step: string
  current_step_label: string
  step_sent_at: string
  total_attempts: number
  waiting_response: boolean
  last_incoming_at: string | null
  last_outgoing_at: string | null
  last_message_preview: string | null
  stage: string | null
}

export interface FollowupConversationsSummary {
  totalActive: number
  filteredTotal: number
  waitingResponse: number
  responded: number
}

export interface FollowupPagination {
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface FollowupConversationsResponse {
  summary: FollowupConversationsSummary
  tree: FollowupTreeNode[]
  conversations: FollowupConversation[]
  pagination: FollowupPagination
}

export interface FollowupTarget {
  conversation_id: string
  contact_id: string | null
  contact_name: string
  contact_phone: string
  stage: string | null
  active_cadence: CadenceType | null
}
