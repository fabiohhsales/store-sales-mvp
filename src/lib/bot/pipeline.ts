// Pipeline base: identifica cliente, faz upsert de contact/conversation, salva mensagem.
// Etapa 1 — sem AI. A saída será consumida pelas etapas seguintes.
//
// runBasePipeline   — pipeline legado (Chatwoot). Mantido para compatibilidade.
// runEvolutionPipeline — novo pipeline direto da Evolution API (sem Chatwoot).

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  NormalizedWebhookMessage,
  NormalizedEvolutionMessage,
  BotContact,
  BotConversation,
  BotMessage,
} from '@/types/bot'
import type { PanelWhatsAppConfig, PanelBotConfig, PanelGoogleConfig } from '@/types/database'
import { stageLabelSlugs } from './stage-labels'

// Baixa mídia da Evolution e faz upload para o Supabase Storage.
// Retorna o storage path (ex: "clientId/convId/msgId.jpg") ou null se falhar.
async function uploadMediaToStorage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  clientId: string,
  conversationId: string,
  mimetype: string
): Promise<string | null> {
  const evolutionUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY
  if (!evolutionUrl || !evolutionKey) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(`${evolutionUrl}/message/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({ message: { key: { remoteJid, fromMe: false, id: messageId } } }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (!res.ok) {
      console.warn(`[Pipeline] Mídia não disponível na Evolution: msg=${messageId} status=${res.status}`)
      return null
    }

    const data = await res.json()
    const base64 = data.base64 as string | undefined
    const resolvedMime = (data.mimetype as string | undefined) ?? mimetype
    if (!base64) return null

    const ext = resolvedMime.split('/')[1]?.split(';')[0] ?? 'bin'
    const storagePath = `${clientId}/${conversationId}/${messageId}.${ext}`
    const buffer = Buffer.from(base64, 'base64')

    const supabase = createAdminClient()
    const { error } = await supabase.storage
      .from('desk-media')
      .upload(storagePath, buffer, { contentType: resolvedMime, upsert: false })

    if (error && !error.message.includes('already exists')) {
      console.error('[Pipeline] Erro ao fazer upload para Storage:', error.message)
      return null
    }

    return storagePath
  } catch (err) {
    console.warn('[Pipeline] Falha ao baixar/enviar mídia:', err)
    return null
  }
}

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

  // Instâncias com Evolution direto são gerenciadas pelo pipeline Evolution — não processar aqui
  if (wConfig.evolution_instance_name) {
    console.log(`[Pipeline-Chatwoot] instância ${wConfig.evolution_instance_name} usa Evolution direto — skipping`)
    return null
  }

  // Verifica se o cliente está ativo — paused/disconnected param o bot
  const { data: clientRow } = await supabase
    .from('panel_clients')
    .select('status')
    .eq('id', wConfig.client_id)
    .maybeSingle()

  const BOT_ALLOWED_STATUSES = ['active', 'pending_google', 'configuring']
  if (!BOT_ALLOWED_STATUSES.includes(clientRow?.status ?? '')) {
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
  msg: NormalizedWebhookMessage,
  clientId: string
): Promise<BotContact> {
  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('chatwoot_id', msg.chatwootContactId)
    .eq('client_id', clientId)
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
      client_id: clientId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    // Duplicate key — tenta por chatwoot_id + client_id (mais específico) ou telefone + client_id
    if (error.code === '23505') {
      const { data: byChatwootId } = await supabase
        .from('contacts')
        .select('*')
        .eq('chatwoot_id', msg.chatwootContactId)
        .eq('client_id', clientId)
        .maybeSingle()
      if (byChatwootId) return byChatwootId as BotContact

      if (msg.contactPhone) {
        const { data: byPhone } = await supabase
          .from('contacts')
          .select('*')
          .eq('phone_number', msg.contactPhone)
          .eq('client_id', clientId)
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
  contact: BotContact,
  defaultLabel: string,
  clientId: string
): Promise<BotConversation> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('chatwoot_conversation_id', msg.chatwootConversationId)
    .eq('account_id', msg.chatwootAccountId)
    .maybeSingle()

  if (existing) {
    const { data: updated } = await supabase
      .from('conversations')
      .update({
        last_incoming_at: new Date().toISOString(),
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
      client_id: clientId,
      status: 'open',
      stage: 'bot_triage',
      account_id: msg.chatwootAccountId,
      chatwoot_contact_id: msg.chatwootContactId,
      labels: [defaultLabel],
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
  conversation: BotConversation,
  clientId: string
): Promise<BotMessage> {
  const { data: saved, error } = await supabase
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      chatwoot_message_id: msg.chatwootMessageId,
      conversation_id: conversation.id,
      client_id: clientId,
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

// =============================================================================
// Pipeline Evolution — sem dependência do Chatwoot
// =============================================================================

async function resolveClientByInstance(instanceName: string): Promise<ClientContext | null> {
  const supabase = createAdminClient()

  const { data: wConfig } = await supabase
    .from('panel_whatsapp_config')
    .select('*')
    .eq('evolution_instance_name', instanceName)
    .maybeSingle()

  if (!wConfig) {
    console.warn(`[Pipeline] Instância não encontrada: ${instanceName}`)
    return null
  }

  const { data: clientRow } = await supabase
    .from('panel_clients')
    .select('status')
    .eq('id', wConfig.client_id)
    .maybeSingle()

  const BOT_ALLOWED_STATUSES = ['active', 'pending_google', 'configuring']
  if (!BOT_ALLOWED_STATUSES.includes(clientRow?.status ?? '')) {
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

async function upsertEvolutionContact(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedEvolutionMessage,
  clientId: string
): Promise<BotContact> {
  // Tenta buscar pelo telefone + cliente (chave natural)
  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone_number', msg.phoneNumber)
    .eq('client_id', clientId)
    .maybeSingle()

  if (existing) {
    // Atualiza nome se mudou (pushName pode mudar)
    if (existing.name !== msg.contactName && msg.contactName) {
      const { data: updated } = await supabase
        .from('contacts')
        .update({ name: msg.contactName })
        .eq('id', existing.id)
        .select()
        .single()
      return (updated ?? existing) as BotContact
    }
    return existing as BotContact
  }

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      id: crypto.randomUUID(),
      name: msg.contactName || msg.phoneNumber,
      phone_number: msg.phoneNumber,
      identifier: msg.remoteJid,
      client_id: clientId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // 1. Race condition: outro processo criou antes — busca pela chave natural nova
      const { data: byPhoneClient } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone_number', msg.phoneNumber)
        .eq('client_id', clientId)
        .maybeSingle()
      if (byPhoneClient) return byPhoneClient as BotContact

      // 2. Contato legado órfão (Chatwoot-era, client_id = NULL) violando o
      //    constraint antigo contacts_phone_account_id_unique.
      //    "Reivindica" o contato para este cliente setando client_id.
      const { data: orphans } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone_number', msg.phoneNumber)
        .is('client_id', null)
        .limit(1)

      if (orphans && orphans.length > 0) {
        const orphan = orphans[0]
        const { data: claimed } = await supabase
          .from('contacts')
          .update({
            client_id: clientId,
            name: msg.contactName || orphan.name || msg.phoneNumber,
            identifier: msg.remoteJid ?? orphan.identifier,
          })
          .eq('id', orphan.id)
          .select()
          .single()
        console.log(`[Pipeline] contato órfão reivindicado: id=${orphan.id} phone=${msg.phoneNumber} → client=${clientId}`)
        return (claimed ?? orphan) as BotContact
      }
    }
    throw new Error(`Falha ao criar contato Evolution: ${error.message}`)
  }

  return created as BotContact
}

async function upsertEvolutionConversation(
  supabase: ReturnType<typeof createAdminClient>,
  contact: BotContact,
  clientId: string,
  defaultLabel: string
): Promise<BotConversation> {
  // Uma conversa aberta por contato+cliente (stage != 'resolved')
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('client_id', clientId)
    .or('stage.neq.resolved,stage.is.null')
    .order('last_incoming_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { data: updated } = await supabase
      .from('conversations')
      .update({
        last_incoming_at: new Date().toISOString(),
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
      contact_id: contact.id,
      client_id: clientId,
      status: 'open',
      // stage permanece no domínio operacional do Desk; o funil do Kanban fica em labels[].
      stage: 'bot_triage',
      labels: [defaultLabel],
      last_incoming_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Falha ao criar conversa Evolution: ${error.message}`)
  return created as BotConversation
}

async function saveEvolutionMessage(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedEvolutionMessage,
  conversation: BotConversation,
  clientId: string
): Promise<BotMessage> {
  // Deduplicação: ignora se a mensagem já foi processada
  const { data: duplicate } = await supabase
    .from('messages')
    .select('id')
    .eq('evolution_message_id', msg.messageId)
    .maybeSingle()

  if (duplicate) {
    // Verifica se a mensagem duplicada pertence à conversa atual
    const { data: existingMsg } = await supabase
      .from('messages')
      .select('*')
      .eq('evolution_message_id', msg.messageId)
      .single()

    if (existingMsg && existingMsg.conversation_id === conversation.id) {
      console.log(`[Pipeline] Mensagem duplicada na mesma conversa — ignorada: ${msg.messageId}`)
      return existingMsg as BotMessage
    }

    // Mensagem existe em outra conversa — re-salva na conversa atual (sem evolution_message_id para evitar conflito de unique)
    console.log(`[Pipeline] Mensagem duplicada em outra conversa, re-salvando na conversa atual: ${msg.messageId}`)
    const { data: reSaved, error: reError } = await supabase
      .from('messages')
      .insert({
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        client_id: clientId,
        content: msg.content,
        content_type: msg.contentType,
        sender_type: 'contact',
        from_who: 'lead',
        created_at: msg.timestamp.toISOString(),
        // evolution_message_id omitido para não violar unique index
      })
      .select()
      .single()

    if (reError) {
      console.error(`[Pipeline] Falha ao re-salvar mensagem duplicada: ${reError.message}`)
      // Retorna a mensagem existente como fallback
      return (existingMsg ?? duplicate) as BotMessage
    }
    return reSaved as BotMessage
  }

  const { data: saved, error } = await supabase
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      evolution_message_id: msg.messageId,
      conversation_id: conversation.id,
      client_id: clientId,
      content: msg.content,
      content_type: msg.contentType,
      sender_type: 'contact',
      from_who: 'lead',
      created_at: msg.timestamp.toISOString(),
    })
    .select()
    .single()

  if (error) {
    // Race condition de duplicata — retorna a existente
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('messages')
        .select('*')
        .eq('evolution_message_id', msg.messageId)
        .single()
      if (existing) return existing as BotMessage
    }
    throw new Error(`Falha ao salvar mensagem Evolution: ${error.message}`)
  }

  const message = saved as BotMessage

  // Para imagens e documentos, faz upload para o Supabase Storage (persistência além do cache da Evolution)
  if (msg.contentType === 'image' || msg.contentType === 'document') {
    const mimetype = msg.contentType === 'image' ? 'image/jpeg' : 'application/octet-stream'
    const storagePath = await uploadMediaToStorage(
      msg.instanceName,
      msg.remoteJid,
      msg.messageId,
      clientId,
      conversation.id,
      mimetype
    )
    if (storagePath) {
      await supabase.from('messages').update({ media_url: storagePath }).eq('id', message.id)
      message.media_url = storagePath
    }
  }

  return message
}

export async function runEvolutionPipeline(
  msg: NormalizedEvolutionMessage
): Promise<PipelineResult | null> {
  const clientContext = await resolveClientByInstance(msg.instanceName)
  if (!clientContext) return null

  // Bloqueia processamento se a conversa está em atendimento humano
  // (verificado depois de ter a conversa — veja abaixo)

  const supabase = createAdminClient()
  const stageSlugs = stageLabelSlugs(clientContext.botConfig?.stage_labels)

  const contact = await upsertEvolutionContact(supabase, msg, clientContext.clientId)
  const conversation = await upsertEvolutionConversation(supabase, contact, clientContext.clientId, stageSlugs[0])

  // Bot silenciado quando humano está envolvido (awaiting ou atendendo)
  if (conversation.stage === 'in_service' || conversation.stage === 'awaiting_human') {
    console.log(`[Pipeline] conv=${conversation.id} stage=${conversation.stage} — bot silenciado`)
    await saveEvolutionMessage(supabase, msg, conversation, clientContext.clientId)
    return null
  }

  const message = await saveEvolutionMessage(supabase, msg, conversation, clientContext.clientId)
  const messageHistory = await getMessageHistory(supabase, conversation.id)

  return { clientContext, contact, conversation, message, messageHistory }
}

// =============================================================================
// Pipeline legado (Chatwoot) — mantido para compatibilidade
// =============================================================================

// --- Entry point público ---

export async function runBasePipeline(msg: NormalizedWebhookMessage): Promise<PipelineResult | null> {
  const clientContext = await resolveClientContext(msg.chatwootAccountId)
  if (!clientContext) return null

  const supabase = createAdminClient()
  const stageSlugs = stageLabelSlugs(clientContext.botConfig?.stage_labels)
  const contact = await upsertContact(supabase, msg, clientContext.clientId)
  const conversation = await upsertConversation(supabase, msg, contact, stageSlugs[0], clientContext.clientId)
  const message = await saveMessage(supabase, msg, conversation, clientContext.clientId)
  const messageHistory = await getMessageHistory(supabase, conversation.id)

  return { clientContext, contact, conversation, message, messageHistory }
}
