import { dispatch } from '@/lib/bot/dispatcher'
import { runAgent } from '@/lib/bot/agent'
import { refreshMessageHistory } from '@/lib/bot/pipeline'
import type { AgentOutput } from '@/lib/bot/output-schema'
import type { PipelineResult } from '@/lib/bot/pipeline'

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

export async function runConversationBotTurn(result: PipelineResult): Promise<BotTurnReport> {
  try {
    const messageHistory = await refreshMessageHistory(result.conversation.id)
    const freshResult: PipelineResult = {
      ...result,
      messageHistory,
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
      reason: error instanceof Error ? error.message : 'bot_turn_error',
    }
  }
}
