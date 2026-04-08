// Dispatcher: roteia o AgentOutput após a decisão da IA.
// Envia resposta WhatsApp via Evolution API, salva mensagem no Supabase.
// Etapa 3 (calendário) será chamada daqui quando agenda_check=true.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage, sendMediaByUrl } from '@/lib/api/evolution'
import { handleAgendaCheck, handleAgendaCreate } from './calendar-agent'
import { clearAiPause } from './agent'
import { normalizeStageSlug } from './stage-labels'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'
import type { PanelBotConfig, IntakeFieldConfig } from '@/types/database'

async function saveIntakeData(
  contactId: string,
  intakeSave: Record<string, string>,
  botConfig: PanelBotConfig | null
): Promise<{ justCompleted: boolean }> {
  const supabase = createAdminClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('custom_data, intake_completed_at')
    .eq('id', contactId)
    .single()

  const current = (contact?.custom_data as Record<string, string> | null) ?? {}
  const merged = { ...current, ...intakeSave }

  const updates: Record<string, unknown> = { custom_data: merged }
  let justCompleted = false

  if (!contact?.intake_completed_at && botConfig?.intake_enabled) {
    const fields = (botConfig.intake_fields as IntakeFieldConfig[] | null) ?? []
    const requiredDone = fields
      .filter((f) => f.required)
      .every((f) => merged[f.key] && merged[f.key] !== '_skipped')
    if (requiredDone) {
      updates.intake_completed_at = new Date().toISOString()
      justCompleted = true
      console.log(`[Dispatcher] Intake completo para contact=${contactId}`)
    }
  }

  await supabase.from('contacts').update(updates).eq('id', contactId)
  return { justCompleted }
}

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
        await saveAiMessage(conversation.id, clientContext.clientId, output.reply)
      } catch (err) {
        console.error('[Dispatcher] Falha ao enviar WhatsApp:', err)
      }
    }
  }

  // --- 2. Handoff: move conversa para fila de espera humana ---
  if (output.handoff.needs_human && conversation.stage === 'bot_triage') {
    await handleHandoff(conversation.id, output.reply, clientContext.clientId, result)
  }

  // --- 2.5. Salva dados do intake se bot coletou um campo ---
  if (output.intake_save && Object.keys(output.intake_save).length > 0) {
    const { justCompleted } = await saveIntakeData(contact.id, output.intake_save, clientContext.botConfig)

    // Se o intake acabou de ser completado e há imagem guia de fotos configurada, envia agora
    const botConfig = clientContext.botConfig
    if (
      justCompleted &&
      botConfig?.intake_request_photos &&
      botConfig?.intake_photo_guide_url
    ) {
      const identifier = contact.identifier ?? contact.phone_number
      if (identifier && whatsappConfig.evolution_instance_name) {
        try {
          await sendMediaByUrl(
            whatsappConfig.evolution_instance_name,
            identifier,
            'image',
            'image/jpeg',
            botConfig.intake_photo_guide_url
          )
          console.log(`[Dispatcher] Imagem guia de fotos enviada para contact=${contact.id}`)
        } catch (err) {
          console.error('[Dispatcher] Falha ao enviar imagem guia:', err)
        }
      }
    }
  }

  // --- 2.6. Handoff automático ao receber fotos após intake completo ---
  const msgContentType = result.message?.content_type
  const intakeConfig = clientContext.botConfig
  if (
    msgContentType === 'image' &&
    intakeConfig?.intake_enabled &&
    intakeConfig?.intake_request_photos &&
    intakeConfig?.intake_handoff_after_photos &&
    conversation.stage === 'bot_triage'
  ) {
    // Increment photo count in custom_data
    const supabase = createAdminClient()
    const { data: contactRow } = await supabase
      .from('contacts')
      .select('custom_data, intake_completed_at')
      .eq('id', contact.id)
      .single()

    if (contactRow?.intake_completed_at) {
      const cd = (contactRow.custom_data as Record<string, string> | null) ?? {}
      const newCount = (parseInt(String(cd._photo_count ?? '0'), 10)) + 1
      const updatedCd = { ...cd, _photo_count: String(newCount) }
      await supabase.from('contacts').update({ custom_data: updatedCd }).eq('id', contact.id)

      if (newCount >= (intakeConfig.intake_photos_count ?? 5)) {
        console.log(`[Dispatcher] ${newCount} fotos recebidas — handoff automático conv=${conversation.id}`)
        await handleHandoff(conversation.id, null, clientContext.clientId, result)
        await clearAiPause(conversation.id)
        return
      }
    }
  }

  // --- 3. Atualiza conversa no Supabase ---
  if (clientContext.botConfig) {
    await updateConversationRecord(conversation.id, output, clientContext.botConfig)
  }

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
  clientId: string,
  reply: string
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('messages').insert({
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    client_id: clientId,
    content: reply,
    content_type: 'text',
    sender_type: 'agent_bot',
    from_who: 'ai',
    created_at: new Date().toISOString(),
  })
  if (error) {
    console.error(`[Dispatcher] Falha ao salvar mensagem da IA na conversa ${conversationId}: ${error.message}`)
  }
}

// Move a conversa para awaiting_human, envia mensagem de handoff ao paciente e persiste resumo
async function handleHandoff(
  conversationId: string,
  handoffMessage: string | null,
  clientId: string,
  result: PipelineResult
): Promise<void> {
  const supabase = createAdminClient()
  const { clientContext, contact } = result
  const { whatsappConfig, botConfig } = clientContext

  // Usa a mensagem de handoff do botConfig como fallback
  const messageToSend = handoffMessage
    || botConfig?.ai_handoff_message
    || 'Vou te transferir para nossa equipe. Um momento, por favor.'

  // Envia a mensagem de handoff ao paciente via Evolution
  const identifier = contact.identifier ?? contact.phone_number
  if (identifier && whatsappConfig.evolution_instance_name) {
    try {
      await sendTextMessage(whatsappConfig.evolution_instance_name, identifier, messageToSend)
    } catch (err) {
      console.error('[Dispatcher] Falha ao enviar mensagem de handoff:', err)
    }
  }

  // Gera resumo da triagem para o operador
  const summary = await generateTriageSummary(result.messageHistory)

  await supabase.from('conversations').update({
    stage: 'awaiting_human',
    summary,
  }).eq('id', conversationId)

  // Persiste a mensagem de handoff no histórico
  await saveAiMessage(conversationId, clientId, messageToSend)

  console.log(`[Dispatcher] Handoff: conv=${conversationId} → awaiting_human`)
}

// Gera resumo da triagem via IA para exibir ao operador humano
async function generateTriageSummary(messages: import('@/types/bot').BotMessage[]): Promise<string> {
  try {
    const { createAiClient } = await import('@/lib/ai/client')
    const openai = createAiClient()

    const history = messages
      .map((m) => `${m.sender_type === 'contact' ? 'Paciente' : 'Bot'}: ${m.content ?? ''}`)
      .join('\n')

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_MINI ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Resuma a conversa abaixo em 2-3 linhas objetivas para o atendente humano.
Inclua: motivo do contato, dados coletados e motivo do encaminhamento. Seja direto e conciso.`,
        },
        { role: 'user', content: history },
      ],
      max_tokens: 200,
    })

    return response.choices[0].message.content ?? 'Triagem sem resumo disponível.'
  } catch {
    return 'Triagem sem resumo disponível.'
  }
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
    last_outgoing_at: output.reply ? new Date().toISOString() : undefined,
    last_outgoing_by: output.reply ? 'ai' : undefined,
  }

  // Remove undefined fields
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete updates[key]
  }

  await supabase.from('conversations').update(updates).eq('id', conversationId)
}
