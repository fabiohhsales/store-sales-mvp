import { createAdminClient } from '@/lib/supabase/admin'
import { emitConversationEvent } from '@/lib/desk/emit-conversation-event'
import { runAgent } from './agent'
import { dispatch } from './dispatcher'
import { refreshMessageHistory, type PipelineResult } from './pipeline'
import type { BotContact, BotConversation, BotMessage } from '@/types/bot'
import type { PanelBotConfig, PanelGoogleConfig, PanelWhatsAppConfig } from '@/types/database'

interface ResumeConversationMeta {
  triggeredBy?: string | null
  previousStage?: string | null
}

interface ResumeConversationResult {
  attempted: boolean
  triggered: boolean
  reason: string
}

type ConversationResumeRow = BotConversation & {
  contacts?: BotContact | BotContact[] | null
  panel_clients?: {
    panel_whatsapp_config?: PanelWhatsAppConfig | PanelWhatsAppConfig[] | null
    panel_bot_config?: PanelBotConfig | PanelBotConfig[] | null
    panel_google_config?: PanelGoogleConfig | PanelGoogleConfig[] | null
  } | Array<{
    panel_whatsapp_config?: PanelWhatsAppConfig | PanelWhatsAppConfig[] | null
    panel_bot_config?: PanelBotConfig | PanelBotConfig[] | null
    panel_google_config?: PanelGoogleConfig | PanelGoogleConfig[] | null
  }> | null
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function isMeaningfulMessage(message: BotMessage): boolean {
  return Boolean(
    message.content?.trim() ||
    message.content_type !== 'text' ||
    message.media_url ||
    message.media_mime_type
  )
}

function resolvePendingLeadMessage(history: BotMessage[]): { message: BotMessage | null; reason: string } {
  const meaningful = history.filter(isMeaningfulMessage)
  const lastMessage = meaningful.at(-1) ?? null

  if (!lastMessage) {
    return { message: null, reason: 'empty_history' }
  }

  if (lastMessage.from_who !== 'lead') {
    if (lastMessage.from_who === 'human') {
      return { message: null, reason: 'latest_message_from_operator' }
    }
    if (lastMessage.from_who === 'ai') {
      return { message: null, reason: 'latest_message_from_bot' }
    }
    return { message: null, reason: 'latest_message_not_lead' }
  }

  return { message: lastMessage, reason: 'pending_lead_message' }
}

async function emitSkip(
  conversationId: string,
  clientId: string,
  reason: string,
  meta: ResumeConversationMeta
): Promise<ResumeConversationResult> {
  await emitConversationEvent(
    conversationId,
    clientId,
    'bot_resume_skipped',
    'system',
    {
      reason,
      previous_stage: meta.previousStage ?? null,
    },
    meta.triggeredBy ?? null
  )

  return { attempted: false, triggered: false, reason }
}

export async function resumeConversationFromDesk(
  conversationId: string,
  meta: ResumeConversationMeta = {}
): Promise<ResumeConversationResult> {
  const admin = createAdminClient()

  const { data: row, error } = await admin
    .from('conversations')
    .select(`
      *,
      contacts (*),
      panel_clients!client_id (
        panel_whatsapp_config (*),
        panel_bot_config (*),
        panel_google_config (*)
      )
    `)
    .eq('id', conversationId)
    .maybeSingle()

  if (error || !row) {
    console.warn('[bot/resume-from-desk] conversation lookup failed:', {
      conversationId,
      error: error?.message ?? null,
    })
    return { attempted: false, triggered: false, reason: 'conversation_not_found' }
  }

  const conversation = row as ConversationResumeRow
  const clientId = conversation.client_id ?? ''
  const panelClient = firstOrNull(conversation.panel_clients)
  const contact = firstOrNull(conversation.contacts)
  const whatsappConfig = firstOrNull(panelClient?.panel_whatsapp_config)
  const botConfig = firstOrNull(panelClient?.panel_bot_config)
  const googleConfig = firstOrNull(panelClient?.panel_google_config)

  if (!clientId) {
    return { attempted: false, triggered: false, reason: 'client_id_missing' }
  }

  if (conversation.status === 'resolved' || conversation.stage === 'resolved') {
    return emitSkip(conversationId, clientId, 'conversation_resolved', meta)
  }

  if (conversation.stage !== 'bot_triage') {
    return emitSkip(conversationId, clientId, 'stage_not_bot_triage', meta)
  }

  if (!contact) {
    return emitSkip(conversationId, clientId, 'contact_not_found', meta)
  }

  if (!botConfig) {
    return emitSkip(conversationId, clientId, 'bot_config_missing', meta)
  }

  if (!whatsappConfig?.evolution_instance_name || !(contact.identifier ?? contact.phone_number)) {
    return emitSkip(conversationId, clientId, 'missing_send_config', meta)
  }

  const messageHistory = await refreshMessageHistory(conversationId, 50)
  const { message, reason } = resolvePendingLeadMessage(messageHistory)
  if (!message) {
    return emitSkip(conversationId, clientId, reason, meta)
  }

  const pipelineResult: PipelineResult = {
    clientContext: {
      clientId,
      whatsappConfig,
      botConfig,
      googleConfig,
    },
    contact,
    conversation,
    message,
    messageHistory,
  }

  await emitConversationEvent(
    conversationId,
    clientId,
    'bot_resume_triggered',
    'system',
    {
      reason,
      previous_stage: meta.previousStage ?? null,
      latest_message_id: message.id,
      latest_message_at: message.created_at,
    },
    meta.triggeredBy ?? null
  )

  try {
    const output = await runAgent(pipelineResult)
    await dispatch(pipelineResult, output)
    return { attempted: true, triggered: true, reason: 'triggered' }
  } catch (resumeError) {
    console.error('[bot/resume-from-desk] replay failed:', {
      conversationId,
      error: resumeError,
    })

    await emitConversationEvent(
      conversationId,
      clientId,
      'bot_resume_failed',
      'system',
      {
        reason: resumeError instanceof Error ? resumeError.message : 'unknown_error',
        previous_stage: meta.previousStage ?? null,
      },
      meta.triggeredBy ?? null
    )

    return { attempted: true, triggered: false, reason: 'resume_failed' }
  }
}
