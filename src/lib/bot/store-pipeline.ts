import { createAdminClient } from '@/lib/supabase/admin'
import {
  upsertEvolutionContact,
  upsertEvolutionConversation,
  saveEvolutionMessage,
  getMessageHistory,
  refreshMessageHistory,
} from './pipeline'
import type { NormalizedEvolutionMessage, BotContact, BotConversation, BotMessage } from '@/types/bot'
import type { StoreContext, StorePipelineResult, StoreAgentSettings } from '@/types/store'
import { stageLabelSlugs } from './stage-labels'

const MESSAGE_DEBOUNCE_MS = 3000

/**
 * Checks if a given Evolution WhatsApp instance is mapped as a Store Sales channel.
 */
export async function checkIfStoreInstance(instanceName: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data: wConfig } = await supabase
    .from('panel_whatsapp_config')
    .select('id')
    .eq('evolution_instance_name', instanceName)
    .maybeSingle()

  if (!wConfig) return false

  const { count } = await supabase
    .from('store_agent_settings')
    .select('id', { count: 'exact', head: true })
    .eq('whatsapp_config_id', wConfig.id)
    .eq('status', 'active')

  return (count ?? 0) > 0
}

/**
 * Resolves the store, settings, and whatsapp configuration context for the instance.
 */
export async function resolveStoreContext(instanceName: string): Promise<StoreContext | null> {
  const supabase = createAdminClient()

  // 1. Get WhatsApp Config
  const { data: wConfig } = await supabase
    .from('panel_whatsapp_config')
    .select('*')
    .eq('evolution_instance_name', instanceName)
    .maybeSingle()

  if (!wConfig) {
    console.warn(`[Store-Pipeline] Instância WhatsApp não encontrada: ${instanceName}`)
    return null
  }

  // 2. Get client status
  const { data: clientRow } = await supabase
    .from('panel_clients')
    .select('status')
    .eq('id', wConfig.client_id)
    .maybeSingle()

  const ALLOWED_STATUSES = ['active', 'pending_google', 'configuring']
  if (!ALLOWED_STATUSES.includes(clientRow?.status ?? '')) {
    console.log(`[Store-Pipeline] client=${wConfig.client_id} status=${clientRow?.status} — bot pausado`)
    return null
  }

  // 3. Get Store Agent Settings and Store Info
  const { data: storeSettings } = await supabase
    .from('store_agent_settings')
    .select('*')
    .eq('whatsapp_config_id', wConfig.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!storeSettings) {
    console.warn(`[Store-Pipeline] Configurações de agente de loja não encontradas para whatsapp_config=${wConfig.id}`)
    return null
  }

  return {
    clientId: wConfig.client_id as string,
    storeId: storeSettings.store_id as string,
    whatsappConfig: wConfig,
    storeSettings: storeSettings as unknown as StoreAgentSettings,
  }
}

/**
 * Check if the conversation has newer lead messages after the given timestamp.
 */
async function hasNewerStoreLeadMessages(conversationId: string, afterIso: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('from_who', 'lead')
    .gt('created_at', afterIso)

  return (count ?? 0) > 0
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

  const { data: botConfig } = await supabase
    .from('panel_bot_config')
    .select('stage_labels')
    .eq('client_id', storeContext.clientId)
    .maybeSingle()

  const slugs = stageLabelSlugs(botConfig?.stage_labels, 'loja')
  const defaultStage = slugs[0] || 'etapa_novo_lead'

  const contact = await upsertEvolutionContact(supabase, msg, storeContext.clientId)
  const conversation = await upsertEvolutionConversation(supabase, contact, storeContext.clientId, defaultStage)

  // Se a conversa está sendo atendida por humano, apenas salva a mensagem e encerra
  if (conversation.stage === 'in_service' || conversation.stage === 'awaiting_human') {
    console.log(`[Store-Pipeline] conv=${conversation.id} stage=${conversation.stage} — bot silenciado`)
    await saveEvolutionMessage(supabase, msg, conversation, storeContext.clientId)
    return null
  }

  const message = await saveEvolutionMessage(supabase, msg, conversation, storeContext.clientId)
  const messageHistory = await getMessageHistory(supabase, conversation.id)

  return {
    storeContext,
    contact,
    conversation,
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
