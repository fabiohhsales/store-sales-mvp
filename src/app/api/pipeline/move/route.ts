import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateConversationLabels } from '@/lib/api/chatwoot'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { client_id, chatwoot_conversation_id, from_stage, to_stage, token } = body

    if (!chatwoot_conversation_id || !from_stage || !to_stage) {
      return NextResponse.json(
        { error: 'chatwoot_conversation_id, from_stage e to_stage são obrigatórios' },
        { status: 400 }
      )
    }

    const auth = await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

    // 1. Busca chatwoot config
    const { data: whatsappConfig } = await admin
      .from('panel_whatsapp_config')
      .select('chatwoot_account_id, chatwoot_agent_token')
      .eq('client_id', auth.client_id)
      .single()

    if (!whatsappConfig?.chatwoot_account_id || !whatsappConfig?.chatwoot_agent_token) {
      return NextResponse.json(
        { error: 'Cliente sem configuração Chatwoot' },
        { status: 404 }
      )
    }

    // 2. Busca labels atuais da conversation
    const { data: conversation } = await admin
      .from('conversations')
      .select('id, labels')
      .eq('chatwoot_conversation_id', chatwoot_conversation_id)
      .eq('account_id', whatsappConfig.chatwoot_account_id)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // 3. Substitui from_stage por to_stage no array de labels
    const currentLabels = (conversation.labels as string[]) || []
    const newLabels = currentLabels.map((l) => (l === from_stage ? to_stage : l))

    // Se from_stage não existia nos labels, adiciona to_stage
    if (!currentLabels.includes(from_stage)) {
      // Remove to_stage se já existir (evita duplicatas)
      const filtered = newLabels.filter((l) => l !== to_stage)
      filtered.push(to_stage)
      newLabels.length = 0
      newLabels.push(...filtered)
    }

    // 4. Atualiza no Chatwoot via API
    await updateConversationLabels(
      whatsappConfig.chatwoot_account_id,
      whatsappConfig.chatwoot_agent_token,
      chatwoot_conversation_id,
      newLabels
    )

    // 5. Atualiza no Supabase local
    await admin
      .from('conversations')
      .update({ labels: newLabels })
      .eq('id', conversation.id)

    return NextResponse.json({ success: true, labels: newLabels })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
