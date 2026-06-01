import type { PanelWhatsAppConfig, BotContact, BotConversation, BotMessage } from './bot'

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

export interface StorePipelineResult {
  storeContext: StoreContext
  contact: BotContact
  conversation: BotConversation
  message: BotMessage
  messageHistory: BotMessage[]
}
