// AI Agent: verifica ai_pauses, chama OpenAI com structured output, valida com Zod.
// Recebe o resultado do pipeline base e retorna AgentOutput para o dispatcher.

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAiClient, AI_MODEL } from '@/lib/ai/client'
import { buildSystemPrompt } from './system-prompt'
import { safeParseAgentOutput, fallbackOutput } from './output-schema'
import { listChatwootStageLabels } from '@/lib/api/chatwoot'
import { sanitizeStageLabels, stageLabelSlugs } from './stage-labels'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'
import type { BotMessage } from '@/types/bot'
import type { PanelBotConfig, StageLabelConfig } from '@/types/database'

const AI_PAUSE_MINUTES = 10
const LABEL_SYNC_CACHE_TTL_MS = 2 * 60 * 1000

const runtimeStageLabelsCache = new Map<string, { syncedAt: number; labels: StageLabelConfig[] }>()

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

export async function clearAiPause(conversationId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('ai_pauses').delete().eq('conversation_id', conversationId)
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

function mergeRuntimeStageLabels(
  localLabels: StageLabelConfig[] | null | undefined,
  remoteLabels: StageLabelConfig[]
): StageLabelConfig[] {
  const local = sanitizeStageLabels(localLabels)
  const remote = sanitizeStageLabels(remoteLabels)

  const localCadenceBySlug = new Map<string, StageLabelConfig['followup_cadence']>()
  for (const item of local) {
    localCadenceBySlug.set(item.slug, item.followup_cadence ?? null)
  }

  const merged: StageLabelConfig[] = remote.map((item) => ({
    ...item,
    followup_cadence: localCadenceBySlug.get(item.slug) ?? item.followup_cadence ?? null,
  }))

  const mergedSlugs = new Set(merged.map((item) => item.slug))
  for (const item of local) {
    if (!mergedSlugs.has(item.slug)) {
      merged.push(item)
    }
  }

  return sanitizeStageLabels(merged)
}

async function resolveRuntimeBotConfig(result: PipelineResult): Promise<PanelBotConfig> {
  const baseConfig = result.clientContext.botConfig
  if (!baseConfig) {
    throw new Error('bot_config_not_found')
  }

  const accountId = result.clientContext.whatsappConfig.chatwoot_account_id
  const accountToken = result.clientContext.whatsappConfig.chatwoot_agent_token

  if (!accountId || !accountToken) {
    return baseConfig
  }

  const now = Date.now()
  const cacheKey = result.clientContext.clientId
  const cached = runtimeStageLabelsCache.get(cacheKey)

  if (cached && now - cached.syncedAt < LABEL_SYNC_CACHE_TTL_MS) {
    return {
      ...baseConfig,
      stage_labels: mergeRuntimeStageLabels(baseConfig.stage_labels, cached.labels),
    }
  }

  try {
    const remoteLabels = await listChatwootStageLabels(accountId, accountToken)
    const sanitizedRemote = sanitizeStageLabels(remoteLabels)

    runtimeStageLabelsCache.set(cacheKey, {
      syncedAt: now,
      labels: sanitizedRemote,
    })

    return {
      ...baseConfig,
      stage_labels: mergeRuntimeStageLabels(baseConfig.stage_labels, sanitizedRemote),
    }
  } catch (err) {
    console.warn(
      `[Agent] Falha no sync runtime de labels client=${result.clientContext.clientId}; usando config local`,
      err
    )

    return baseConfig
  }
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

  const runtimeBotConfig = await resolveRuntimeBotConfig(result)
  const stageCurrent = (conversation.labels ?? []).find((label) => label.startsWith('etapa_')) ?? null

  const systemPrompt = buildSystemPrompt(runtimeBotConfig, contact.name ?? 'Paciente', {
    status: conversation.status,
    labelsCurrent: conversation.labels ?? [],
    stageCurrent,
    followupCadenceCurrent: conversation.followup_cadence,
    appointmentStatus: conversation.appointment_status,
    lastIncomingAt: conversation.last_incoming_at,
    lastOutgoingAt: conversation.last_outgoing_at,
  })
  const chatMessages = buildChatMessages(messageHistory, systemPrompt)

  try {
    const openai = createAiClient()
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: chatMessages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''
    const output = safeParseAgentOutput(rawContent, {
      validStageSlugs: stageLabelSlugs(runtimeBotConfig.stage_labels),
    })

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
