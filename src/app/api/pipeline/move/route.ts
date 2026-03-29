import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateConversationLabels } from '@/lib/api/chatwoot'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      client_id,
      conversation_id,         // UUID (novo modelo Evolution)
      chatwoot_conversation_id, // int (legado Chatwoot)
      from_stage,
      to_stage,
      token,
    } = body

    if (!from_stage || !to_stage) {
      return NextResponse.json(
        { error: 'from_stage e to_stage são obrigatórios' },
        { status: 400 }
      )
    }

    if (!conversation_id && !chatwoot_conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id ou chatwoot_conversation_id são obrigatórios' },
        { status: 400 }
      )
    }

    const auth = await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

    // Busca a conversa — prioriza UUID, fallback para chatwoot_conversation_id
    let conversation: { id: string; labels: string[]; chatwoot_conversation_id: number | null } | null = null

    if (conversation_id) {
      const { data } = await admin
        .from('conversations')
        .select('id, labels, chatwoot_conversation_id')
        .eq('id', conversation_id)
        .eq('client_id', auth.client_id)
        .maybeSingle()
      conversation = data
    } else {
      // Legado: busca por chatwoot_conversation_id
      const [{ data: whatsappConfig }, { data: clientRow }] = await Promise.all([
        admin
          .from('panel_whatsapp_config')
          .select('chatwoot_account_id')
          .eq('client_id', auth.client_id)
          .maybeSingle(),
        admin
          .from('panel_clients')
          .select('chatwoot_account_id')
          .eq('id', auth.client_id)
          .maybeSingle(),
      ])
      const accountId = whatsappConfig?.chatwoot_account_id ?? clientRow?.chatwoot_account_id ?? null

      if (accountId) {
        const { data } = await admin
          .from('conversations')
          .select('id, labels, chatwoot_conversation_id')
          .eq('chatwoot_conversation_id', chatwoot_conversation_id)
          .eq('account_id', accountId)
          .maybeSingle()
        conversation = data
      }
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // Substitui from_stage por to_stage no array de labels
    const currentLabels = (conversation.labels as string[]) || []
    let newLabels = currentLabels.map((l) => (l === from_stage ? to_stage : l))

    // Se from_stage não existia, adiciona to_stage (sem duplicatas)
    if (!currentLabels.includes(from_stage)) {
      newLabels = [...newLabels.filter((l) => l !== to_stage), to_stage]
    }

    // Atualiza no Supabase
    await admin
      .from('conversations')
      .update({ labels: newLabels })
      .eq('id', conversation.id)

    // Sincroniza com Chatwoot se a conversa tiver chatwoot_conversation_id (fallback)
    if (conversation.chatwoot_conversation_id) {
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
          await updateConversationLabels(
            accountId,
            agentToken,
            conversation.chatwoot_conversation_id,
            newLabels
          )
        }
      } catch (chatwootErr) {
        // Chatwoot sync falhou — não interrompe (é fallback)
        console.warn('[pipeline/move] Chatwoot sync falhou (ignorado):', chatwootErr)
      }
    }

    return NextResponse.json({ success: true, labels: newLabels })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
