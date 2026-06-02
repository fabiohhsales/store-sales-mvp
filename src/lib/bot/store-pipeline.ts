import { createAdminClient } from '@/lib/supabase/admin'
import { uploadMediaToStorage } from './media-storage'
import { processDownloadedMultimodalMessage } from './multimodal'
import type { NormalizedEvolutionMessage } from '@/types/bot'
import type { StoreContext, StorePipelineResult, StoreAgentSettings } from '@/types/store'

const MESSAGE_DEBOUNCE_MS = 3000

/**
 * Checks if a given Evolution WhatsApp instance is mapped as an active Store Sales channel.
 */
export async function checkIfStoreInstance(instanceName: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data: channel } = await supabase
    .from('store_channels')
    .select('id')
    .eq('evolution_instance_name', instanceName)
    .eq('status', 'active')
    .maybeSingle()

  if (!channel) return false

  const { count } = await supabase
    .from('store_agent_settings')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channel.id)
    .eq('status', 'active')

  return (count ?? 0) > 0
}

/**
 * Resolves the store, settings, and whatsapp configuration context for the instance.
 */
export async function resolveStoreContext(instanceName: string): Promise<StoreContext | null> {
  const supabase = createAdminClient()

  // 1. Get Store Channel
  const { data: channel } = await supabase
    .from('store_channels')
    .select('*')
    .eq('evolution_instance_name', instanceName)
    .eq('status', 'active')
    .maybeSingle()

  if (!channel) {
    console.warn(`[Store-Pipeline] Canal da loja não encontrado ou inativo: ${instanceName}`)
    return null
  }

  // 2. Get Account
  const { data: account } = await supabase
    .from('store_accounts')
    .select('status')
    .eq('id', channel.account_id)
    .maybeSingle()

  if (!account || account.status !== 'active') {
    console.log(`[Store-Pipeline] account=${channel.account_id} status=${account?.status} — bot pausado`)
    return null
  }

  // 3. Get Store Agent Settings
  const { data: storeSettings } = await supabase
    .from('store_agent_settings')
    .select('*')
    .eq('channel_id', channel.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!storeSettings) {
    console.warn(`[Store-Pipeline] Configurações de agente de loja não encontradas para o canal=${channel.id}`)
    return null
  }

  return {
    clientId: channel.account_id as string,
    storeId: channel.store_id as string,
    whatsappConfig: channel as any,
    storeSettings: storeSettings as unknown as StoreAgentSettings,
  }
}

/**
 * Check if the conversation has newer lead messages after the given timestamp.
 */
async function hasNewerStoreLeadMessages(conversationId: string, afterIso: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('store_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('from_who', 'lead')
    .gt('created_at', afterIso)

  return (count ?? 0) > 0
}

/**
 * Upserts a store contact.
 */
async function upsertStoreContact(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedEvolutionMessage,
  accountId: string,
  storeId: string | null
): Promise<any> {
  const { data: existing } = await supabase
    .from('store_contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone_number', msg.phoneNumber)
    .maybeSingle()

  if (existing) {
    if (existing.name !== msg.contactName && msg.contactName) {
      const { data: updated } = await supabase
        .from('store_contacts')
        .update({ name: msg.contactName, remote_jid: msg.remoteJid })
        .eq('id', existing.id)
        .select()
        .single()
      return updated ?? existing
    }
    return existing
  }

  const { data: created, error } = await supabase
    .from('store_contacts')
    .insert({
      id: crypto.randomUUID(),
      account_id: accountId,
      store_id: storeId,
      name: msg.contactName || msg.phoneNumber,
      phone_number: msg.phoneNumber,
      remote_jid: msg.remoteJid,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('store_contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('phone_number', msg.phoneNumber)
        .maybeSingle()
      if (retry) return retry
    }
    throw new Error(`Failed to upsert store contact: ${error.message}`)
  }

  return created
}

/**
 * Upserts a store conversation.
 */
async function upsertStoreConversation(
  supabase: ReturnType<typeof createAdminClient>,
  contact: any,
  accountId: string,
  storeId: string | null,
  channelId: string | null
): Promise<any> {
  const { data: existing } = await supabase
    .from('store_conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('account_id', accountId)
    .neq('operational_status', 'resolved')
    .order('last_incoming_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { data: updated } = await supabase
      .from('store_conversations')
      .update({
        last_incoming_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    return updated ?? existing
  }

  const { data: created, error } = await supabase
    .from('store_conversations')
    .insert({
      id: crypto.randomUUID(),
      account_id: accountId,
      store_id: storeId,
      channel_id: channelId,
      contact_id: contact.id,
      operational_status: 'bot_active',
      commercial_stage: 'new_lead',
      last_incoming_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to upsert store conversation: ${error.message}`)
  return created
}

/**
 * Saves an evolution message to store_messages.
 */
async function saveStoreMessage(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedEvolutionMessage,
  conversation: any,
  accountId: string,
  storeId: string | null
): Promise<any> {
  const { data: existing } = await supabase
    .from('store_messages')
    .select('*')
    .eq('evolution_message_id', msg.messageId)
    .maybeSingle()

  if (existing) {
    if (existing.conversation_id === conversation.id) {
      return existing
    }
    if (existing.account_id === accountId) {
      const { data: migrated } = await supabase
        .from('store_messages')
        .update({ conversation_id: conversation.id })
        .eq('id', existing.id)
        .select()
        .single()
      return migrated ?? existing
    }
    return existing
  }

  const processingRequired = msg.contentType === 'audio' || msg.contentType === 'image'
  const { data: saved, error } = await supabase
    .from('store_messages')
    .insert({
      id: crypto.randomUUID(),
      account_id: accountId,
      store_id: storeId,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      evolution_message_id: msg.messageId,
      remote_jid: msg.remoteJid,
      from_who: 'lead',
      sender_type: 'contact',
      content: msg.content,
      content_type: msg.contentType,
      raw_payload: msg.rawPayload,
      ai_input_text: msg.content,
      created_at: msg.timestamp.toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('store_messages')
        .select('*')
        .eq('evolution_message_id', msg.messageId)
        .maybeSingle()
      if (retry) return retry
    }
    throw new Error(`Failed to save store message: ${error.message}`)
  }

  const message = saved

  // Handle multimodal media downloads (audio, image, document, video)
  if (msg.contentType === 'image' || msg.contentType === 'document' || msg.contentType === 'audio' || msg.contentType === 'video') {
    const mimetype = msg.mediaMimetype ?? (
      msg.contentType === 'image' ? 'image/jpeg' :
      msg.contentType === 'audio' ? 'audio/ogg' :
      msg.contentType === 'video' ? 'video/mp4' :
      'application/octet-stream'
    )
    
    try {
      const { storagePath, buffer: mediaBuffer, resolvedMime, oggTruncated } = await uploadMediaToStorage(
        msg.instanceName,
        msg.remoteJid,
        msg.messageId,
        accountId,
        conversation.id,
        mimetype,
        msg.mediaUrl
      )

      const mediaUpdate: Record<string, any> = {}
      if (storagePath) mediaUpdate.media_url = storagePath
      mediaUpdate.media_mime_type = resolvedMime

      if (processingRequired && mediaBuffer) {
        const processed = await processDownloadedMultimodalMessage({
          contentType: msg.contentType,
          content: msg.content,
          buffer: mediaBuffer,
          resolvedMime,
          oggTruncated,
        })
        mediaUpdate.content = processed.derivedText || msg.content
        mediaUpdate.ai_input_text = processed.aiInputText
      }

      if (Object.keys(mediaUpdate).length > 0) {
        const { data: updated } = await supabase
          .from('store_messages')
          .update(mediaUpdate)
          .eq('id', message.id)
          .select()
          .single()
        return updated ?? message
      }
    } catch (mediaErr) {
      console.error('[Store-Pipeline] Error processing media upload:', mediaErr)
    }
  }

  return message
}

/**
 * Gets conversation message history from store_messages.
 */
async function getStoreMessageHistory(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  limit = 20
): Promise<any[]> {
  const { data } = await supabase
    .from('store_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as any[]).reverse()
}

/**
 * Store-specific pipeline execution: upserts contact/conversation, saves message and fetches history.
 */
export async function runStorePipeline(
  msg: NormalizedEvolutionMessage
): Promise<StorePipelineResult | null> {
  const storeContext = await resolveStoreContext(msg.instanceName)
  if (!storeContext) return null

  const supabase = createAdminClient()

  const contact = await upsertStoreContact(supabase, msg, storeContext.clientId, storeContext.storeId)
  const conversation = await upsertStoreConversation(supabase, contact, storeContext.clientId, storeContext.storeId, storeContext.whatsappConfig.id)

  const returnedConv = {
    ...conversation,
    stage: conversation.operational_status // Map operational_status to stage for compatibility
  }

  // Se a conversa está sendo atendida por humano, apenas salva a mensagem e encerra
  if (returnedConv.stage === 'in_service' || returnedConv.stage === 'awaiting_human') {
    console.log(`[Store-Pipeline] conv=${conversation.id} stage=${returnedConv.stage} — bot silenciado`)
    await saveStoreMessage(supabase, msg, conversation, storeContext.clientId, storeContext.storeId)
    return null
  }

  const message = await saveStoreMessage(supabase, msg, conversation, storeContext.clientId, storeContext.storeId)
  const messageHistory = await getStoreMessageHistory(supabase, conversation.id)

  return {
    storeContext,
    contact,
    conversation: returnedConv,
    message,
    messageHistory,
  }
}

/**
 * Store Webhook Pipeline router entry point. Handles debouncing and triggers the store AI agent.
 */
export async function runStorePipelineRoute(msg: NormalizedEvolutionMessage): Promise<void> {
  try {
    // 1. Process pipeline and persist message
    const result = await runStorePipeline(msg)
    if (!result) return

    const { storeContext, contact, conversation, message } = result
    console.log(
      `[Store-Route] client=${storeContext.clientId} store=${storeContext.storeId}` +
      ` contact=${contact.id} conv=${conversation.id}`
    )

    // Trigger entity extraction asynchronously
    try {
      const { runStoreEntityExtraction } = await import('./store-intelligence')
      void runStoreEntityExtraction(message, conversation, storeContext)
    } catch (extractErr) {
      console.error('[Store-Route] Failed to import/run store entity extraction:', extractErr)
    }

    // 2. Debounce: wait 3s for user to finish typing multiple messages
    await new Promise((resolve) => setTimeout(resolve, MESSAGE_DEBOUNCE_MS))

    // 3. Yield to newer incoming webhook calls if any
    const newer = await hasNewerStoreLeadMessages(conversation.id, message.created_at)
    if (newer) {
      console.log(`[Store-Route] conv=${conversation.id} debounce: newer messages found — skipping AI`)
      return
    }

    // 4. Run Store Bot Turn (Agent decision + Dispatcher)
    await runStoreConversationBotTurn(result)
  } catch (err) {
    console.error('[Store-Route] Erro no fluxo de execução de loja:', err)
  }
}

/**
 * Runs the Store Conversation Turn (queries AI Agent and dispatches response actions).
 */
async function runStoreConversationBotTurn(result: StorePipelineResult): Promise<void> {
  const { runStoreAgent } = await import('./store-agent')
  const { dispatchStoreAgent } = await import('./store-dispatcher')

  console.log(`[Store-Agent] Executando turno da IA para conv=${result.conversation.id} (RAG / Loja)`)
  const output = await runStoreAgent(result)
  await dispatchStoreAgent(result, output)
}
