// Tipos das tabelas existentes do bot (contacts, conversations, messages, appointments, ai_pauses)
// e dos payloads de webhook (Chatwoot legado + Evolution API)

// --- Tabelas existentes (NÃO são panel_*, NÃO modificar o schema) ---

export interface BotContact {
  id: string
  chatwoot_id: number | null
  name: string | null
  phone_number: string | null
  identifier: string | null
  client_id: string | null
  created_at: string
  custom_data: Record<string, string> | null
  intake_completed_at: string | null
}

export interface BotConversation {
  id: string
  chatwoot_conversation_id: number | null
  contact_id: string
  status: 'pending' | 'open' | 'resolved'
  account_id: number | null
  client_id: string | null
  stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved'
  updated_at: string
  chatwoot_contact_id: number | null
  labels: string[]
  last_incoming_at: string | null
  last_outgoing_at: string | null
  last_outgoing_by: string | null
  appointment_status: string | null
  followup_cadence: string | null
  last_followup_at: string | null
  pending_slots: Array<{ label: string; startISO: string; endISO: string }> | null
  assigned_operator_id: string | null
  resolved_at: string | null
  summary: string | null
}

export interface BotMessage {
  id: string
  chatwoot_message_id: number | null
  evolution_message_id: string | null
  conversation_id: string
  content: string | null
  content_type: string
  sender_type: string
  created_at: string
  from_who: 'lead' | 'human' | 'ai'
  client_id: string | null
  chatwoot_conversation_id: string | null
  source_id: string | null
}

export interface BotAppointment {
  id: string
  conversation_id: string
  contact_id: string | null
  google_event_id: string
  title: string | null
  start_at: string
  end_at: string
  modality: string | null
  status: string | null
  confirmation_sent_at: string | null
  reminder_sent_at: string | null
  confirmation_response: string | null
  meet_link: string | null
  created_at: string
  updated_at: string
}

export interface BotAiPause {
  conversation_id: string
  paused_until: string
  paused_reason: string | null
  paused_by: string | null
  updated_at: string
}

// --- Payload do webhook do Chatwoot (formato v4.x) ---
// Evento: message_created
// Campos da mensagem ficam na raiz do payload

export interface ChatwootWebhookPayload {
  event: string
  account: {
    id: number
    name: string
  }
  // Campos da mensagem (raiz do payload no v4)
  id?: number
  content?: string | null
  content_type?: string
  message_type?: number | string   // 0/'incoming', 1/'outgoing', 2/'activity', 3/'template'
  private?: boolean
  created_at?: string | number
  sender?: {
    id: number
    name: string
    type: string  // 'contact' | 'agent' | 'agent_bot'
  }
  attachments?: Array<{
    id: number
    message_id: number
    file_type: string   // 'audio' | 'image' | 'video' | 'file'
    data_url: string
  }>
  conversation: {
    id: number
    status: string
    inbox_id: number
    labels: string[]
    // Chatwoot v4.9: contact fica em meta.sender
    meta?: {
      sender?: {
        id: number
        name: string
        phone_number: string | null
        identifier: string | null
      }
    }
    // Versões antigas tinham contact direto (mantido por compatibilidade)
    contact?: {
      id: number
      name: string
      phone_number: string | null
      identifier: string | null
    }
  }
}

// Dados normalizados extraídos do webhook Chatwoot para uso no pipeline (legado)
export interface NormalizedWebhookMessage {
  chatwootAccountId: number
  chatwootConversationId: number
  chatwootContactId: number
  chatwootMessageId: number
  contactName: string
  contactPhone: string | null
  contactIdentifier: string | null
  messageContent: string
  contentType: 'text' | 'audio' | 'image'
  attachments: Array<{ data_url: string; file_type: string }>
}

// --- Payload da Evolution API (webhook direto, sem Chatwoot) ---

export interface EvolutionWebhookPayload {
  event: string
  instance: string // nome da instância (= evolution_instance_name)
  data: {
    key: {
      remoteJid: string   // "5532999999999@s.whatsapp.net"
      fromMe: boolean
      id: string          // message ID único da Evolution
    }
    pushName?: string     // nome do contato no WhatsApp
    message?: {
      conversation?: string
      extendedTextMessage?: { text: string }
      imageMessage?: { caption?: string; url?: string; mimetype?: string }
      audioMessage?: object
      documentMessage?: { fileName?: string }
    }
    messageType?: string  // "conversation" | "extendedTextMessage" | etc.
    messageTimestamp?: number
  }
  // connection.update
  state?: 'open' | 'close' | 'connecting'
}

// Dados normalizados da Evolution API para uso no pipeline
export interface NormalizedEvolutionMessage {
  instanceName: string
  remoteJid: string      // "5532999999999@s.whatsapp.net"
  phoneNumber: string    // apenas números: "5532999999999"
  contactName: string
  messageId: string
  content: string
  contentType: 'text' | 'image' | 'audio' | 'document' | 'unknown'
  timestamp: Date
  mediaUrl: string | null
}
