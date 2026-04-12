// GET /api/desk/conversations/[id]
// Retorna a conversa com histórico completo de mensagens e dados do contato.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: conversation, error } = await admin
    .from('conversations')
    .select(`
      id, stage, status, labels, summary,
      assigned_operator_id, last_incoming_at, last_outgoing_at, stage_changed_at,
      client_id,
      journey_stage, handoff_reason_code, handoff_reason_label,
      handoff_transferred_at, handoff_returned_to_bot_at, last_system_action,
      contacts ( id, name, phone_number, identifier, custom_data )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[desk/conversations] detail error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
  if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Valida que o operador tem acesso a este cliente
  if (!deskUser.isAdmin && conversation.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Inclui mensagens com client_id null para não esconder históricos antigos/bugados.
  // A segurança já está garantida pelo filtro de conversation_id + validação de acesso acima.
  let msgQuery = admin
    .from('messages')
    .select('id, content, content_type, sender_type, from_who, created_at, evolution_message_id, media_url, media_mime_type, media_filename, media_size_bytes, media_duration_seconds, media_transcript, whatsapp_status')
    .eq('conversation_id', id)

  if (conversation.client_id) {
    msgQuery = msgQuery.or(`client_id.eq.${conversation.client_id},client_id.is.null`)
  }

  const { data: messages, error: msgError } = await msgQuery
    .order('created_at', { ascending: true })
    .limit(150)

  if (msgError) {
    console.error(`[desk/conversations/${id}] Erro ao buscar mensagens: ${msgError.message}`)
    return NextResponse.json({ error: 'Erro ao buscar mensagens', conversation }, { status: 500 })
  }

  console.log(`[desk/conversations/${id}] ${messages?.length ?? 0} mensagem(ns) retornada(s)`)

  return NextResponse.json({ conversation, messages: messages ?? [] })
}
