// Tipos das respostas das APIs externas

// --- Evolution API ---

export interface EvolutionInstanceResponse {
  instance: {
    instanceName: string
    instanceId: string
    integration: string
    token: string
    status: string
  }
  hash: {
    apikey: string
  }
  qrcode?: {
    pairingCode: string | null
    code: string
    base64: string
    count: number
  }
  settings?: Record<string, unknown>
  chatwoot?: Record<string, unknown>
  webhook?: Record<string, unknown>
}

export interface EvolutionConnectionState {
  instance: {
    instanceName: string
    state: 'open' | 'connecting' | 'close'
  }
}

export interface EvolutionQRCode {
  pairingCode: string | null
  code: string
  base64: string
  count: number
}

export interface WhatsAppConnectionResponse {
  instance: string
  state: 'open' | 'connecting' | 'disconnected' | 'error'
  base64: string | null
  pairingCode: string | null
  connectedPhone: string | null
  lastUpdatedAt: string
}

export interface EvolutionFetchInstance {
  instance: {
    instanceName: string
    instanceId: string
    owner: string
    profileName: string
    profilePictureUrl: string | null
    profileStatus: string
    status: string
    serverUrl: string
    apikey: string
    integration: string
  }
}

// --- Chatwoot API ---

export interface ChatwootAccount {
  id: number
  name: string
  access_token: string
  login_email?: string
}

export interface ChatwootInbox {
  id: number
  name: string
  channel_type: string
  greeting_enabled: boolean
  greeting_message: string | null
  working_hours_enabled: boolean
  out_of_office_message: string | null
  timezone: string
  phone_number: string | null
}

export interface ChatwootInboxListResponse {
  payload: ChatwootInbox[]
}

export interface ChatwootAgent {
  id: number
  name: string
  email: string
  role: string
  availability_status: string
}

export type ChatwootAgentRole = 'agent' | 'administrator'

export interface ChatwootAgentInput {
  name: string
  email: string
  role: ChatwootAgentRole
}

export interface ChatwootConversation {
  id: number
  inbox_id: number
  status: string
  contact: {
    id: number
    name: string
    phone_number: string
  }
  messages: Array<{
    id: number
    content: string
    message_type: number
    created_at: number
  }>
}

// --- Google OAuth ---

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
}

export interface GoogleCalendarListEntry {
  id: string
  summary: string
  description?: string
  primary?: boolean
  accessRole: string
  backgroundColor?: string
}

export interface GoogleCalendarListResponse {
  kind: string
  items: GoogleCalendarListEntry[]
}
