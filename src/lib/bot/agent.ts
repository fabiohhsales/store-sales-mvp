// AI Agent: verifica ai_pauses, chama OpenAI com structured output, valida com Zod.
// Recebe o resultado do pipeline base e retorna AgentOutput para o dispatcher.

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAiClient, AI_MODEL } from '@/lib/ai/client'
import { buildSystemPrompt } from './system-prompt'
import { safeParseAgentOutput, fallbackOutput } from './output-schema'
import { resolveAgentInputText } from './multimodal'

import { stageLabelSlugs } from './stage-labels'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'
import type { BotMessage } from '@/types/bot'
import type { PanelBotConfig } from '@/types/database'

const AI_PAUSE_MINUTES = 0.5 // Safety net only — debounce handles message batching

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

async function setAiPause(conversationId: string, clientId?: string | null): Promise<void> {
  const supabase = createAdminClient()
  const pausedUntil = new Date(Date.now() + AI_PAUSE_MINUTES * 60 * 1000).toISOString()

  await supabase.from('ai_pauses').upsert(
    {
      conversation_id: conversationId,
      paused_until: pausedUntil,
      paused_by: 'bot',
      paused_reason: 'processing',
      updated_at: new Date().toISOString(),
      ...(clientId ? { client_id: clientId } : {}),
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
    if (msg.from_who === 'lead') {
      const userContent = resolveAgentInputText(msg)
      if (!userContent) continue
      messages.push({ role: 'user', content: userContent })
    } else if (msg.from_who === 'ai') {
      // Armazena só o texto da resposta, não o JSON completo
      if (!msg.content) continue
      messages.push({ role: 'assistant', content: msg.content })
    }
    // Mensagens de agente humano (from_who='human') são ignoradas no contexto da IA
  }

  return messages
}

function resolveRuntimeBotConfig(result: PipelineResult): PanelBotConfig {
  const baseConfig = result.clientContext.botConfig
  if (!baseConfig) {
    throw new Error('bot_config_not_found')
  }
  return baseConfig
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
  await setAiPause(conversation.id, conversation.client_id)

  const runtimeBotConfig = resolveRuntimeBotConfig(result)
  const stageCurrent = (conversation.labels ?? []).find((label) => label.startsWith('etapa_')) ?? null

  // Busca appointment futuro para injetar no prompt
  const hasActiveApptStatus = conversation.appointment_status === 'scheduled' || conversation.appointment_status === 'confirmed'
  let upcomingAppointment: { id: string; start_at: string; end_at: string; status: string; title: string | null } | null = null
  if (hasActiveApptStatus) {
    const supabaseAppt = createAdminClient()
    const { data: apptData } = await supabaseAppt
      .from('appointments')
      .select('id, start_at, end_at, status, title')
      .eq('conversation_id', conversation.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    upcomingAppointment = apptData ?? null
  }

  // Classifica contexto do paciente para guiar a IA
  const labels = conversation.labels ?? []
  let patientContext: 'new_patient' | 'returning_no_appointment' | 'has_future_appointment' | 'checking_existing'
  if (upcomingAppointment) {
    patientContext = 'has_future_appointment'
  } else if (hasActiveApptStatus) {
    patientContext = 'checking_existing'
  } else {
    const engaged = labels.some((label) => label.includes('qualificacao') || label.includes('agendando') || label.includes('atendimento'))
    patientContext = engaged ? 'returning_no_appointment' : 'new_patient'
  }

  const systemPrompt = buildSystemPrompt(runtimeBotConfig, contact.name ?? 'Paciente', {
    status: conversation.status,
    labelsCurrent: labels,
    stageCurrent,
    followupCadenceCurrent: conversation.followup_cadence,
    appointmentStatus: conversation.appointment_status,
    lastIncomingAt: conversation.last_incoming_at,
    lastOutgoingAt: conversation.last_outgoing_at,
    upcomingAppointment,
    patientContext,
  }, {
    custom_data: contact.custom_data ?? null,
    intake_completed_at: contact.intake_completed_at ?? null,
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
