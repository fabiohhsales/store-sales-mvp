// AI Agent: verifica ai_pauses, chama OpenAI com structured output, valida com Zod.
// Recebe o resultado do pipeline base e retorna AgentOutput para o dispatcher.

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAiClient, AI_MODEL } from '@/lib/ai/client'
import { buildSystemPrompt } from './system-prompt'
import { safeParseAgentOutput, fallbackOutput } from './output-schema'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'
import type { BotMessage } from '@/types/bot'

const openai = createAiClient()

const AI_PAUSE_MINUTES = 10

// --- AI Pause ---

async function isAiPaused(conversationId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('ai_pauses')
    .select('paused_until')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (!data) return false
  return new Date(data.paused_until) > new Date()
}

async function setAiPause(conversationId: string): Promise<void> {
  const supabase = createAdminClient()
  const pausedUntil = new Date(Date.now() + AI_PAUSE_MINUTES * 60 * 1000).toISOString()

  await supabase.from('ai_pauses').upsert(
    {
      conversation_id: conversationId,
      paused_until: pausedUntil,
      paused_by: 'bot',
      paused_reason: 'processing',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id' }
  )
}

// --- Formata histórico de mensagens para o contexto OpenAI ---

function buildChatMessages(
  history: BotMessage[],
  systemPrompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const msg of history) {
    if (!msg.content) continue

    if (msg.from_who === 'lead') {
      messages.push({ role: 'user', content: msg.content })
    } else if (msg.from_who === 'ai') {
      // Armazena só o texto da resposta, não o JSON completo
      messages.push({ role: 'assistant', content: msg.content })
    }
    // Mensagens de agente humano (from_who='human') são ignoradas no contexto da IA
  }

  return messages
}

// --- Chamada principal ---

export async function runAgent(result: PipelineResult): Promise<AgentOutput> {
  const { clientContext, contact, conversation, messageHistory } = result

  // Sem config do bot, não tem como rodar o agente
  if (!clientContext.botConfig) {
    console.warn(`[Agent] client=${clientContext.clientId} sem panel_bot_config`)
    return fallbackOutput
  }

  // Verifica trava de IA — se pausado, ignora silenciosamente
  const paused = await isAiPaused(conversation.id)
  if (paused) {
    console.log(`[Agent] conv=${conversation.id} está em ai_pause — pulando IA`)
    return { ...fallbackOutput, debug: { ...fallbackOutput.debug, notes: 'ai_paused' } }
  }

  // Seta a trava antes de processar (evita execução dupla)
  await setAiPause(conversation.id)

  const systemPrompt = buildSystemPrompt(clientContext.botConfig, contact.name ?? 'Paciente')
  const chatMessages = buildChatMessages(messageHistory, systemPrompt)

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: chatMessages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''
    const output = safeParseAgentOutput(rawContent)

    console.log(
      `[Agent] conv=${conversation.id} intent=${output.debug.detected_intent}` +
      ` status=${output.status_next} handoff=${output.handoff.needs_human}` +
      ` agenda_check=${output.actions.agenda_check.should_check}`
    )

    return output
  } catch (err) {
    console.error('[Agent] Erro na chamada OpenAI:', err)
    return fallbackOutput
  }
}
