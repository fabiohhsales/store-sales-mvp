// Dispatcher: roteia o AgentOutput após a decisão da IA.
// Envia resposta WhatsApp, salva mensagem da IA, atualiza Chatwoot.
// Etapa 3 (calendário) será chamada daqui quando agenda_check=true.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { updateConversationStatus, updateConversationLabels } from '@/lib/api/chatwoot'
import { handleAgendaCheck, handleAgendaCreate } from './calendar-agent'
import { clearAiPause } from './agent'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'

export async function dispatch(result: PipelineResult, output: AgentOutput): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { whatsappConfig } = clientContext

  try {
    // --- 1. Envia resposta WhatsApp ---
    const identifier = contact.identifier ?? contact.phone_number
    const instanceName = whatsappConfig.evolution_instance_name

    if (identifier && instanceName) {
      // Handoff: envia ai_handoff_message antes de transferir para humano
      if (output.handoff.needs_human) {
        const handoffMsg = clientContext.botConfig?.ai_handoff_message
        if (handoffMsg) {
          try {
            await sendTextMessage(instanceName, identifier, handoffMsg)
            await saveAiMessage(conversation.id, conversation.chatwoot_conversation_id, handoffMsg)
          } catch (err) {
            console.error('[Dispatcher] Falha ao enviar mensagem de handoff:', err)
          }
        }
      } else if (output.reply) {
        try {
          await sendTextMessage(instanceName, identifier, output.reply)
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
    try {
      await updateConversationRecord(conversation.id, output)
    } catch (err) {
      console.error('[Dispatcher] Falha ao atualizar conversa:', err)
    }

    // --- 4. Agenda ---
    if (output.actions.agenda_check.should_check) {
      await handleAgendaCheck(result, output)
    }

    if (output.actions.agenda_create.should_create) {
      await handleAgendaCreate(result, output)
    }
  } finally {
    // Libera trava SEMPRE — mesmo que qualquer etapa acima falhe
    await clearAiPause(conversation.id)
  }
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
  output: AgentOutput
): Promise<void> {
  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {
    labels: output.labels_next,
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
