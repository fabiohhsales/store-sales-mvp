import { createAdminClient } from '@/lib/supabase/admin'
import { dispatch } from '@/lib/bot/dispatcher'
import { runAgent } from '@/lib/bot/agent'
import { refreshMessageHistory } from '@/lib/bot/pipeline'
import { fallbackOutput, type AgentOutput } from '@/lib/bot/output-schema'
import { logMultimodalEvent, resolveAgentInputText } from '@/lib/bot/multimodal'
import type { PipelineResult } from '@/lib/bot/pipeline'
import type { BotMessage } from '@/types/bot'

export interface BotTurnReport {
  attempted: boolean
  sent: boolean
  reason: string | null
}

function hasOutboundReplyConfig(result: PipelineResult): boolean {
  const identifier = result.contact.identifier ?? result.contact.phone_number
  return Boolean(identifier && result.clientContext.whatsappConfig.evolution_instance_name)
}

function resolveReplyReason(result: PipelineResult, output: AgentOutput): string | null {
  if (output.debug?.notes === 'ai_paused') {
    return 'ai_paused'
  }

  if (output.handoff.needs_human) {
    return 'handoff'
  }

  if (!output.reply?.trim()) {
    return 'no_useful_reply'
  }

  if (!hasOutboundReplyConfig(result)) {
    return 'missing_send_config'
  }

  return null
}

type MultimodalDecision = 'ask_resend' | 'ask_explanation' | 'handoff'

function resolveMultimodalDecision(processingError: string | null | undefined): MultimodalDecision {
  switch (processingError) {
    case 'audio_source_truncated':
    case 'transcription_empty':
    case 'media_download_failed':
    case 'missing_ai_input_text':
      return 'ask_resend'
    case 'vision_empty':
    case 'vision_processing_failed':
      return 'ask_explanation'
    default:
      return 'handoff'
  }
}

function buildMultimodalBaseOutput(result: PipelineResult) {
  const stageLabel = result.conversation.labels?.find((label) => label.startsWith('etapa_')) ?? 'etapa_triagem'
  return {
    stageLabel,
    base: {
      ...fallbackOutput,
      status_next: 'open' as const,
      labels_next: [stageLabel, ...((result.conversation.labels ?? []).filter((label) => !label.startsWith('etapa_')))],
      classification: {
        intent: fallbackOutput.classification.intent,
        stage: stageLabel,
        status: 'open' as const,
      },
      debug: {
        ...fallbackOutput.debug,
        stage_current: stageLabel,
      },
    },
  }
}

function buildMultimodalAskResendOutput(result: PipelineResult): AgentOutput {
  const { base } = buildMultimodalBaseOutput(result)
  return {
    ...base,
    reply: 'Recebi seu áudio, mas ele chegou incompleto por aqui. Pode me mandar de novo ou escrever rapidinho o que precisa?',
    handoff: { needs_human: false, reason: null },
    debug: { ...base.debug, notes: 'multimodal_ask_resend' },
  }
}

function buildMultimodalAskExplanationOutput(result: PipelineResult): AgentOutput {
  const { base } = buildMultimodalBaseOutput(result)
  return {
    ...base,
    reply: 'Recebi a imagem, mas não consegui analisar com segurança. Pode me explicar rapidinho o que devo observar nela?',
    handoff: { needs_human: false, reason: null },
    debug: { ...base.debug, notes: 'multimodal_ask_explanation' },
  }
}

function buildMultimodalHandoffOutput(result: PipelineResult): AgentOutput {
  const { base } = buildMultimodalBaseOutput(result)
  return {
    ...base,
    reply: 'Não consegui interpretar a mídia por aqui com segurança. Vou deixar nossa equipe assumir para não te passar uma informação errada.',
    handoff: { needs_human: true, reason: 'multimodal_processing_failed' },
    debug: { ...base.debug, notes: 'multimodal_processing_failed' },
  }
}

function shouldFallbackForMultimodal(message: BotMessage | undefined): boolean {
  if (!message) return false
  if (message.from_who !== 'lead') return false
  if (message.content_type !== 'audio' && message.content_type !== 'image') return false

  const readyInput = resolveAgentInputText(message)
  return message.processing_status === 'failed' || !readyInput
}

async function markMessageSentToAgent(message: BotMessage): Promise<void> {
  const admin = createAdminClient()
  const sentAt = new Date().toISOString()

  const { error } = await admin
    .from('messages')
    .update({ sent_to_agent_at: sentAt })
    .eq('id', message.id)

  if (error) {
    console.warn(`[BotTurn] Falha ao marcar sent_to_agent_at para msg=${message.id}: ${error.message}`)
    return
  }

  if (message.content_type === 'audio' || message.content_type === 'image') {
    logMultimodalEvent('multimodal_sent_to_agent', {
      conversationId: message.conversation_id,
      messageId: message.evolution_message_id ?? message.id,
      contentType: message.content_type,
      provider: message.derived_kind === 'vision_analysis' ? 'openai' : message.derived_kind === 'transcription' ? 'openai' : null,
      processing_status: message.processing_status,
      processing_error: message.processing_error,
    })
  }
}

export async function runConversationBotTurn(result: PipelineResult): Promise<BotTurnReport> {
  try {
    const messageHistory = await refreshMessageHistory(result.conversation.id)
    const freshResult: PipelineResult = {
      ...result,
      messageHistory,
    }

    const latestLeadMessage = messageHistory.findLast((message) => message.id === result.message.id)
      ?? messageHistory.findLast((message) => message.from_who === 'lead')
      ?? result.message

    if (shouldFallbackForMultimodal(latestLeadMessage)) {
      logMultimodalEvent(
        'multimodal_failed',
        {
          conversationId: freshResult.conversation.id,
          messageId: latestLeadMessage.evolution_message_id ?? latestLeadMessage.id,
          contentType: latestLeadMessage.content_type,
          provider: latestLeadMessage.derived_kind === 'vision_analysis' ? 'openai' : latestLeadMessage.derived_kind === 'transcription' ? 'openai' : null,
          processing_status: latestLeadMessage.processing_status,
          processing_error: latestLeadMessage.processing_error ?? 'missing_ai_input_text',
        },
        'warn'
      )

      // processingError ?? 'missing_ai_input_text' garante que mensagens sem erro
      // explícito (áudio ainda em processamento, sem texto derivado) peçam reenvio
      // em vez de disparar handoff imediato.
      const decision = resolveMultimodalDecision(latestLeadMessage.processing_error ?? 'missing_ai_input_text')
      const recoveryOutput =
        decision === 'ask_resend' ? buildMultimodalAskResendOutput(freshResult)
        : decision === 'ask_explanation' ? buildMultimodalAskExplanationOutput(freshResult)
        : buildMultimodalHandoffOutput(freshResult)

      await dispatch(freshResult, recoveryOutput)

      return {
        attempted: true,
        sent: decision !== 'handoff',
        reason: decision === 'handoff' ? 'multimodal_processing_failed' : decision,
      }
    }

    if (latestLeadMessage && resolveAgentInputText(latestLeadMessage)) {
      await markMessageSentToAgent(latestLeadMessage)
    }

    const output = await runAgent(freshResult)
    const reason = resolveReplyReason(freshResult, output)

    await dispatch(freshResult, output)

    return {
      attempted: true,
      sent: reason === null,
      reason,
    }
  } catch (error) {
    console.error('[BotTurn] Falha ao executar turno da conversa:', error)
    return {
      attempted: true,
      sent: false,
      reason: 'bot_turn_error',
    }
  }
}
