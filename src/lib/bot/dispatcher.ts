// Dispatcher: roteia o AgentOutput após a decisão da IA.
// Envia resposta WhatsApp, salva mensagem da IA, atualiza Chatwoot.
// Etapa 3 (calendário) será chamada daqui quando agenda_check=true.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { updateConversationStatus, updateConversationLabels } from '@/lib/api/chatwoot'
import { handleAgendaCheck, handleAgendaCreate } from './calendar-agent'
import { clearAiPause } from './agent'
import { normalizeStageSlug } from './stage-labels'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'
import type { PanelBotConfig } from '@/types/database'

function normalizeTag(value: string): string {
  return normalizeStageSlug(value)
}

function detectFollowupCadence(
  output: AgentOutput,
  botConfig: PanelBotConfig
): 'lead' | 'atendimento' | 'agendado' | null {
  const labels = output.labels_next.map(normalizeTag)
  const stageLabel = labels.find((label) => label.startsWith('etapa_')) ?? null
  const stage = output.classification.stage ? normalizeTag(output.classification.stage) : null

  const mappedCadences = new Map<string, 'lead' | 'atendimento' | 'agendado'>()
  for (const item of botConfig.stage_labels ?? []) {
    if (!item.followup_cadence) {
      continue
    }
    mappedCadences.set(normalizeTag(item.slug), item.followup_cadence)
  }

  if (mappedCadences.size > 0) {
    if (stageLabel) {
      const mappedByStageLabel = mappedCadences.get(stageLabel)
      if (mappedByStageLabel) {
        return mappedByStageLabel
      }
    }

    for (const label of labels) {
      const mapped = mappedCadences.get(label)
      if (mapped) {
        return mapped
      }
    }

    if (stage) {
      const mappedByStage = mappedCadences.get(stage)
      if (mappedByStage) {
        return mappedByStage
      }
    }
  }

  const hasAny = (expected: string[]) => expected.some((item) => labels.includes(item))

  if (
    hasAny(['etapa_agendado', 'etapa_confirmado', 'agendado', 'confirmado']) ||
    stage === 'agendado' ||
    stage === 'confirmado'
  ) {
    return 'agendado'
  }

  if (
    hasAny(['etapa_paciente', 'etapa_qualificacao', 'em_atendimento', 'atendimento']) ||
    stage === 'atendimento' ||
    stage === 'qualificacao'
  ) {
    return 'atendimento'
  }

  if (
    hasAny(['etapa_triagem', 'etapa_inativo', 'lead', 'novo_contato']) ||
    stage === 'lead' ||
    stage === 'triagem'
  ) {
    return 'lead'
  }

  return null
}

export async function dispatch(result: PipelineResult, output: AgentOutput): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { whatsappConfig } = clientContext

  // --- 1. Envia resposta WhatsApp (se houver reply e não for handoff) ---
  if (output.reply && !output.handoff.needs_human) {
    const identifier = contact.identifier ?? contact.phone_number
    if (identifier && whatsappConfig.evolution_instance_name) {
      try {
        await sendTextMessage(
          whatsappConfig.evolution_instance_name,
          identifier,
          output.reply
        )
        await saveAiMessage(conversation.id, conversation.chatwoot_conversation_id, output.reply)
      } catch (err) {
        console.error('[Dispatcher] Falha ao enviar WhatsApp:', err)
      }
    }
  }

  // --- 2. Atualiza status e labels no Chatwoot (Account isolada do cliente) ---
  const accountId = whatsappConfig.chatwoot_account_id
  const accountToken = whatsappConfig.chatwoot_agent_token

  if (accountId && accountToken) {
    try {
      if (output.status_next !== 'pending') {
        await updateConversationStatus(
          accountId,
          accountToken,
          conversation.chatwoot_conversation_id,
          output.status_next
        )
      }

      if (output.labels_next.length > 0) {
        await updateConversationLabels(
          accountId,
          accountToken,
          conversation.chatwoot_conversation_id,
          output.labels_next
        )
      }
    } catch (err) {
      console.error('[Dispatcher] Falha ao atualizar Chatwoot:', err)
    }
  }

  // --- 3. Atualiza conversa no Supabase ---
  await updateConversationRecord(conversation.id, output, clientContext.botConfig)

  // --- 4. Agenda ---
  if (output.actions.agenda_check.should_check) {
    await handleAgendaCheck(result, output)
  }

  if (output.actions.agenda_create.should_create) {
    await handleAgendaCreate(result, output)
  }

  // --- 5. Libera trava de IA para próximas mensagens ---
  await clearAiPause(conversation.id)
}

// Salva a mensagem de resposta da IA na tabela messages
async function saveAiMessage(
  conversationId: string,
  chatwootConversationId: number,
  reply: string
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('messages').insert({
    id: crypto.randomUUID(),
    chatwoot_message_id: 0, // preenchido depois quando Chatwoot confirmar
    conversation_id: conversationId,
    content: reply,
    content_type: 'text',
    sender_type: 'agent_bot',
    created_at: new Date().toISOString(),
    from_who: 'ai',
    chatwoot_conversation_id: String(chatwootConversationId),
    source_id: null,
  })
}

// Atualiza status, labels e timestamps na tabela conversations
async function updateConversationRecord(
  conversationId: string,
  output: AgentOutput,
  botConfig: PanelBotConfig
): Promise<void> {
  const supabase = createAdminClient()
  const followupCadence = output.labels_next.length > 0 ? detectFollowupCadence(output, botConfig) : null

  const updates: Record<string, unknown> = {
    status: output.classification.status,
    labels: output.labels_next,
    followup_cadence: followupCadence ?? undefined,
    updated_at: new Date().toISOString(),
    last_outgoing_at: output.reply ? new Date().toISOString() : undefined,
    last_outgoing_by: output.reply ? 'ai' : undefined,
  }

  // Remove undefined fields
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete updates[key]
  }

  await supabase.from('conversations').update(updates).eq('id', conversationId)
}
