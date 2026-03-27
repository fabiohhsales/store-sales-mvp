// Pipeline base: identifica cliente, faz upsert de contact/conversation, salva mensagem.
// Etapa 1 — sem AI. A saída será consumida pelas etapas seguintes.

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  NormalizedWebhookMessage,
  BotContact,
  BotConversation,
  BotMessage,
} from '@/types/bot'
import type { PanelWhatsAppConfig, PanelBotConfig, PanelGoogleConfig } from '@/types/database'

// --- Contexto do cliente resolvido a partir do chatwoot_account_id ---

export interface ClientContext {
  clientId: string
  whatsappConfig: PanelWhatsAppConfig
  botConfig: PanelBotConfig | null
  googleConfig: PanelGoogleConfig | null
}

// --- Resultado do pipeline base ---

export interface PipelineResult {
  clientContext: ClientContext
  contact: BotContact
  conversation: BotConversation
  message: BotMessage
  messageHistory: BotMessage[]
}

// --- Funções internas ---

async function resolveClientContext(chatwootAccountId: number): Promise<ClientContext | null> {
  const supabase = createAdminClient()

  const { data: wConfig } = await supabase
    .from('panel_whatsapp_config')
    .select('*')
    .eq('chatwoot_account_id', chatwootAccountId)
    .maybeSingle()

  if (!wConfig) return null

  // Verifica se o cliente está ativo — paused/disconnected param o bot
  const { data: clientRow } = await supabase
    .from('panel_clients')
    .select('status')
    .eq('id', wConfig.client_id)
    .maybeSingle()

  if (clientRow?.status !== 'active') {
    console.log(`[Pipeline] client=${wConfig.client_id} status=${clientRow?.status} — bot pausado`)
    return null
  }

  const [{ data: botConfig }, { data: googleConfig }] = await Promise.all([
    supabase.from('panel_bot_config').select('*').eq('client_id', wConfig.client_id).maybeSingle(),
    supabase.from('panel_google_config').select('*').eq('client_id', wConfig.client_id).maybeSingle(),
  ])

  return {
    clientId: wConfig.client_id as string,
    whatsappConfig: wConfig as PanelWhatsAppConfig,
    botConfig: botConfig as PanelBotConfig | null,
    googleConfig: googleConfig as PanelGoogleConfig | null,
  }
}

async function upsertContact(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedWebhookMessage
): Promise<BotContact> {
  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('chatwoot_id', msg.chatwootContactId)
    .maybeSingle()

  if (existing) return existing as BotContact

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      id: crypto.randomUUID(),
      chatwoot_id: msg.chatwootContactId,
      name: msg.contactName,
      phone_number: msg.contactPhone,
      identifier: msg.contactIdentifier,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    // Duplicate key — tenta por chatwoot_id (mais específico) ou telefone
    if (error.code === '23505') {
      const { data: byChatwootId } = await supabase
        .from('contacts')
        .select('*')
        .eq('chatwoot_id', msg.chatwootContactId)
        .maybeSingle()
      if (byChatwootId) return byChatwootId as BotContact

      if (msg.contactPhone) {
        const { data: byPhone } = await supabase
          .from('contacts')
          .select('*')
          .eq('phone_number', msg.contactPhone)
          .limit(1)
        if (byPhone && byPhone.length > 0) return byPhone[0] as BotContact
      }
    }
    throw new Error(`Falha ao criar contato: ${error.message}`)
  }
  return created as BotContact
}

async function upsertConversation(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedWebhookMessage,
  contact: BotContact
): Promise<BotConversation> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('chatwoot_conversation_id', msg.chatwootConversationId)
    .maybeSingle()

  if (existing) {
    const { data: updated } = await supabase
      .from('conversations')
      .update({
        last_incoming_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    return (updated ?? existing) as BotConversation
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      id: crypto.randomUUID(),
      chatwoot_conversation_id: msg.chatwootConversationId,
      contact_id: contact.id,
      status: 'pending',
      account_id: msg.chatwootAccountId,
      updated_at: new Date().toISOString(),
      chatwoot_contact_id: msg.chatwootContactId,
      labels: ['etapa_triagem'],
      last_incoming_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Falha ao criar conversa: ${error.message}`)
  return created as BotConversation
}

async function saveMessage(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedWebhookMessage,
  conversation: BotConversation
): Promise<BotMessage> {
  const { data: saved, error } = await supabase
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      chatwoot_message_id: msg.chatwootMessageId,
      conversation_id: conversation.id,
      content: msg.messageContent,
      content_type: msg.contentType,
      sender_type: 'contact',
      created_at: new Date().toISOString(),
      from_who: 'lead',
      chatwoot_conversation_id: String(msg.chatwootConversationId),
      source_id: msg.contactIdentifier,
    })
    .select()
    .single()

  if (error) throw new Error(`Falha ao salvar mensagem: ${error.message}`)
  return saved as BotMessage
}

async function getMessageHistory(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  limit = 20
): Promise<BotMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as BotMessage[]).reverse()
}

// --- Entry point público ---

export async function runBasePipeline(msg: NormalizedWebhookMessage): Promise<PipelineResult | null> {
  const clientContext = await resolveClientContext(msg.chatwootAccountId)
  if (!clientContext) return null

  const supabase = createAdminClient()
  const contact = await upsertContact(supabase, msg)
  const conversation = await upsertConversation(supabase, msg, contact)
  const message = await saveMessage(supabase, msg, conversation)
  const messageHistory = await getMessageHistory(supabase, conversation.id)

  return { clientContext, contact, conversation, message, messageHistory }
}
