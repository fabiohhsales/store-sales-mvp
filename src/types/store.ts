import type { PanelWhatsAppConfig } from './database'

export interface Store {
  id: string
  client_id: string
  name: string
  slug: string | null
  city: string | null
  state: string | null
  default_delivery_region: string | null
  status: 'active' | 'inactive'
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface StoreHandoffRules {
  handoff_when?: string[]
  max_bot_messages_before_handoff?: number
}

export interface StoreAgentSettings {
  id: string
  client_id: string
  store_id: string
  whatsapp_config_id: string
  agent_name: string
  tone_of_voice: string
  auto_reply_enabled: boolean
  rag_enabled: boolean
  human_handoff_enabled: boolean
  fallback_message: string | null
  handoff_rules: StoreHandoffRules
  business_rules: Record<string, any>
  prompt_config: Record<string, any>
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface StoreContext {
  clientId: string
  storeId: string
  whatsappConfig: PanelWhatsAppConfig
  storeSettings: StoreAgentSettings
}

export interface StoreContact {
  id: string
  account_id: string
  store_id: string | null
  name: string | null
  phone_number: string
  remote_jid: string | null
  email: string | null
  city: string | null
  state: string | null
  tags: string[]
  custom_data: Record<string, any>
  created_at: string
  updated_at: string
}

export interface StoreConversation {
  id: string
  account_id: string
  store_id: string | null
  channel_id: string | null
  contact_id: string
  operational_status: 'bot_active' | 'awaiting_human' | 'in_service' | 'resolved' | 'paused'
  commercial_stage: 'new_lead' | 'product_discovery' | 'product_recommended' | 'offer_formatting' | 'price_requested' | 'quote_requested' | 'payment_link_sent' | 'negotiation' | 'won' | 'lost'
  assigned_user_id: string | null
  summary: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  last_intent: string | null
  handoff_reason: string | null
  lost_reason: string | null
  won_at: string | null
  resolved_at: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  // Compatibility fields
  stage: string
}

export interface StoreMessage {
  id: string
  account_id: string
  store_id: string | null
  conversation_id: string
  contact_id: string | null
  evolution_message_id: string | null
  remote_jid: string | null
  from_who: 'lead' | 'ai' | 'human' | 'system'
  sender_type: string | null
  content: string | null
  content_type: string
  media_url: string | null
  media_mime_type: string | null
  raw_payload: any
  ai_input_text: string | null
  whatsapp_status: string | null
  created_at: string
}

export interface StorePipelineResult {
  storeContext: StoreContext
  contact: StoreContact
  conversation: StoreConversation
  message: StoreMessage
  messageHistory: StoreMessage[]
}
