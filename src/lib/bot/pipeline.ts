// Pipeline base: identifica cliente, faz upsert de contact/conversation, salva mensagem.
// Etapa 1 — sem AI. A saída será consumida pelas etapas seguintes.
//
// runBasePipeline   — pipeline legado (Chatwoot). Mantido para compatibilidade.
// runEvolutionPipeline — novo pipeline direto da Evolution API (sem Chatwoot).

import { createAdminClient } from '@/lib/supabase/admin'
import { uploadMediaToStorage as uploadMediaToStorageShared } from './media-storage'
import {
  buildAiInputText,
  logMultimodalEvent,
  processDownloadedMultimodalMessage,
} from './multimodal'
import type {
  NormalizedWebhookMessage,
  NormalizedEvolutionMessage,
  BotContact,
  BotConversation,
  BotMessage,
} from '@/types/bot'
import type { PanelWhatsAppConfig, PanelBotConfig, PanelGoogleConfig } from '@/types/database'
import { stageLabelSlugs } from './stage-labels'

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

/** Public wrapper for refreshing message history after debounce. */
export async function refreshMessageHistory(conversationId: string, limit = 20): Promise<BotMessage[]> {
  return getMessageHistory(createAdminClient(), conversationId, limit)
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

export async function saveEvolutionMessage(
  supabase: ReturnType<typeof createAdminClient>,
  msg: NormalizedEvolutionMessage,
  conversation: BotConversation,
  clientId: string
): Promise<BotMessage> {
  // Deduplicação: ignora se a mensagem já foi processada
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('*')
    .eq('evolution_message_id', msg.messageId)
    .maybeSingle()

  if (existingMsg) {
    if (existingMsg.conversation_id === conversation.id) {
      console.log(`[Pipeline] Mensagem duplicada na mesma conversa — ignorada: ${msg.messageId}`)
      return existingMsg as BotMessage
    }

    // Cross-tenant guard: never reassign a message across clients.
    // evolution_message_id is not globally unique across instances, so
    // a collision between two different tenants must NOT migrate the
    // row — that would leak history across clients.
    if (existingMsg.client_id && existingMsg.client_id !== clientId) {
      console.warn(
        `[Pipeline] Cross-tenant evolution_message_id collision — refusing to migrate`,
        {
          messageId: msg.messageId,
          existingClientId: existingMsg.client_id,
          incomingClientId: clientId,
        }
      )
      return existingMsg as BotMessage
    }

    // Mensagem existe em outra conversa do MESMO cliente — migra para a conversa atual
    // (UPDATE mantém evolution_message_id para deduplicação)
    console.log(`[Pipeline] Mensagem em outra conversa, migrando para conversa atual: ${msg.messageId}`)
    const { data: migrated, error: migrateError } = await supabase
      .from('messages')
      .update({
        conversation_id: conversation.id,
        client_id: clientId,
      })
      .eq('evolution_message_id', msg.messageId)
      .select()
      .single()

    if (migrateError) {
      console.error(`[Pipeline] Falha ao migrar mensagem para conversa atual: ${migrateError.message}`)
      return existingMsg as BotMessage // fallback seguro — tem todos os campos
    }
    return migrated as BotMessage
  }

  const processingRequired = msg.contentType === 'audio' || msg.contentType === 'image'
  const baseAiInputText = buildAiInputText(msg.contentType, msg.content, null)
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
      raw_payload: msg.rawPayload,
      derived_text: null,
      derived_kind: null,
      processing_status: processingRequired ? 'received' : 'not_required',
      processing_error: null,
      ai_input_text: baseAiInputText,
      sent_to_agent_at: null,
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

  if (processingRequired) {
    logMultimodalEvent('multimodal_received', {
      conversationId: conversation.id,
      messageId: msg.messageId,
      contentType: msg.contentType,
      processing_status: 'received',
    })
  }

  // Para imagens, áudios, vídeos e documentos, faz upload para o Supabase Storage
  if (msg.contentType === 'image' || msg.contentType === 'document' || msg.contentType === 'audio' || msg.contentType === 'video') {
    const mimetype = msg.mediaMimetype ?? (
      msg.contentType === 'image' ? 'image/jpeg' :
      msg.contentType === 'audio' ? 'audio/ogg' :
      msg.contentType === 'video' ? 'video/mp4' :
      'application/octet-stream'
    )
    let multimodalProvider: 'openai' | 'groq' | null = null
    let processedLogPayload: Record<string, unknown> | null = null

    const { storagePath, buffer: mediaBuffer, resolvedMime } = await uploadMediaToStorageShared(
      msg.instanceName,
      msg.remoteJid,
      msg.messageId,
      clientId,
      conversation.id,
      mimetype,
      msg.mediaUrl,
      (event, payload) => console.warn(`[Pipeline] ${event}`, payload)
    )

    // Metadados de mídia para persistir no banco
    const mediaUpdate: Record<string, unknown> = {}
    if (storagePath) mediaUpdate.media_url = storagePath
    mediaUpdate.media_mime_type = resolvedMime
    if (msg.mediaFilename) mediaUpdate.media_filename = msg.mediaFilename
    if (msg.mediaDuration != null) mediaUpdate.media_duration_seconds = msg.mediaDuration
    if (msg.mediaWidth != null) mediaUpdate.media_width = msg.mediaWidth
    if (msg.mediaHeight != null) mediaUpdate.media_height = msg.mediaHeight
    if (mediaBuffer) mediaUpdate.media_size_bytes = mediaBuffer.length

    if (processingRequired) {
      if (!mediaBuffer) {
        mediaUpdate.processing_status = 'failed'
        mediaUpdate.processing_error = 'media_download_failed'
        mediaUpdate.ai_input_text = null
        logMultimodalEvent(
          'multimodal_failed',
          {
            conversationId: conversation.id,
            messageId: msg.messageId,
            contentType: msg.contentType,
            provider: null,
            processing_status: 'failed',
            processing_error: 'media_download_failed',
          },
          'warn'
        )
      } else {
        mediaUpdate.processing_status = 'downloaded'
        mediaUpdate.processing_error = null

        logMultimodalEvent('multimodal_downloaded', {
          conversationId: conversation.id,
          messageId: msg.messageId,
          contentType: msg.contentType,
          provider: null,
          processing_status: 'downloaded',
        })

        const processed = await processDownloadedMultimodalMessage({
          contentType: msg.contentType,
          content: msg.content,
          buffer: mediaBuffer,
          resolvedMime,
        })
        multimodalProvider = processed.provider

        mediaUpdate.processing_status = processed.processingStatus
        mediaUpdate.processing_error = processed.processingError
        mediaUpdate.derived_text = processed.derivedText
        mediaUpdate.derived_kind = processed.derivedKind
        mediaUpdate.ai_input_text = processed.aiInputText

        if (processed.mediaTranscript) {
          mediaUpdate.media_transcript = processed.mediaTranscript
        }

        if (processed.processingStatus === 'processed') {
          processedLogPayload = {
            conversationId: conversation.id,
            messageId: msg.messageId,
            contentType: msg.contentType,
            provider: processed.provider,
            processing_status: processed.processingStatus,
            processing_error: null,
          }
        } else if (processed.processingStatus === 'failed') {
          logMultimodalEvent(
            'multimodal_failed',
            {
              conversationId: conversation.id,
              messageId: msg.messageId,
              contentType: msg.contentType,
              provider: processed.provider,
              processing_status: processed.processingStatus,
              processing_error: processed.processingError,
            },
            'warn'
          )
        }
      }
    }

    if (Object.keys(mediaUpdate).length > 0) {
      const { error: updateError } = await supabase
        .from('messages')
        .update(mediaUpdate)
        .eq('id', message.id)

      if (updateError) {
        if (processingRequired) {
          logMultimodalEvent(
            'multimodal_failed',
            {
              conversationId: conversation.id,
              messageId: msg.messageId,
              contentType: msg.contentType,
              provider: multimodalProvider,
              processing_status: 'failed',
              processing_error: 'message_update_failed',
              last_processing_status: mediaUpdate.processing_status ?? null,
              update_error: updateError.message,
            },
            'warn'
          )
        } else {
          console.warn(
            `[Pipeline] Falha ao persistir metadados de mídia para msg=${msg.messageId}: ${updateError.message}`
          )
        }
      } else {
        Object.assign(message, mediaUpdate)
        if (storagePath) message.media_url = storagePath
        if (processedLogPayload) {
          logMultimodalEvent('multimodal_processed', processedLogPayload)
        }
      }
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
