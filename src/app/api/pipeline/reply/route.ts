import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'
import { updateConversationLabels } from '@/lib/api/chatwoot'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, client_id, conversation_id, content, auto_move_enabled, auto_move_to_stage } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id é obrigatório' }, { status: 400 })
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content é obrigatório' }, { status: 400 })
    }

    const auth = await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

    const { data: conv } = await admin
      .from('conversations')
      .select('id, client_id, contact_id, labels, stage, chatwoot_conversation_id')
      .eq('id', conversation_id)
      .eq('client_id', auth.client_id)
      .maybeSingle()

    if (!conv) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    const [{ data: contact }, { data: whatsappConfig }] = await Promise.all([
      admin
        .from('contacts')
        .select('identifier, phone_number')
        .eq('id', conv.contact_id)
        .maybeSingle(),
      admin
        .from('panel_whatsapp_config')
        .select('evolution_instance_name')
        .eq('client_id', auth.client_id)
        .maybeSingle(),
    ])

    const recipient = contact?.identifier ?? contact?.phone_number
    const instanceName = whatsappConfig?.evolution_instance_name

    if (!recipient || !instanceName) {
      return NextResponse.json({ error: 'Configuração de envio indisponível para a conversa' }, { status: 422 })
    }

    const text = content.trim()
    await sendTextMessage(instanceName, recipient, text)

    const now = new Date().toISOString()
    const { data: message, error: insertError } = await admin
      .from('messages')
      .insert({
        id: crypto.randomUUID(),
        conversation_id: conversation_id,
        client_id: auth.client_id,
        content: text,
        content_type: 'text',
        sender_type: 'operator',
        from_who: 'human',
        created_at: now,
      })
      .select('id, content, from_who, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    const shouldAutoMove = Boolean(auto_move_enabled && typeof auto_move_to_stage === 'string' && auto_move_to_stage.trim())

    if (shouldAutoMove) {
      const targetStage = auto_move_to_stage as string

      const { data: botConfigRow } = await admin
        .from('panel_bot_config')
        .select('stage_labels')
        .eq('client_id', auth.client_id)
        .maybeSingle()

      const stageLabels = sanitizeStageLabels(botConfigRow?.stage_labels)
      const validStageSlugs = new Set(stageLabels.map((s) => s.slug))
      if (!validStageSlugs.has(targetStage)) {
        return NextResponse.json({ error: 'auto_move_to_stage inválido para o cliente' }, { status: 400 })
      }

      const stageSlugsForLabels = new Set([...validStageSlugs, '_sem_etapa'])
      const currentLabels = (conv.labels as string[]) || []
      const baseLabels = currentLabels.filter((label) => !stageSlugsForLabels.has(label))
      const newLabels = [...baseLabels, targetStage]

      await admin
        .from('conversations')
        .update({
          labels: newLabels,
          stage: targetStage,
          last_outgoing_at: now,
          last_outgoing_by: 'operator',
        })
        .eq('id', conversation_id)

      if (conv.chatwoot_conversation_id) {
        try {
          const [{ data: whatsappConfig }, { data: clientRow }] = await Promise.all([
            admin
              .from('panel_whatsapp_config')
              .select('chatwoot_account_id, chatwoot_agent_token')
              .eq('client_id', auth.client_id)
              .maybeSingle(),
            admin
              .from('panel_clients')
              .select('chatwoot_account_id, chatwoot_agent_token')
              .eq('id', auth.client_id)
              .maybeSingle(),
          ])

          const accountId = whatsappConfig?.chatwoot_account_id ?? clientRow?.chatwoot_account_id ?? null
          const agentToken = whatsappConfig?.chatwoot_agent_token ?? clientRow?.chatwoot_agent_token ?? null

          if (accountId && agentToken) {
            await updateConversationLabels(accountId, agentToken, conv.chatwoot_conversation_id, newLabels)
          }
        } catch (chatwootErr) {
          console.warn('[pipeline/reply] Chatwoot sync falhou (ignorado):', chatwootErr)
        }
      }
    } else {
      await admin
        .from('conversations')
        .update({
          last_outgoing_at: now,
          last_outgoing_by: 'operator',
        })
        .eq('id', conversation_id)
    }

    return NextResponse.json(message)
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
