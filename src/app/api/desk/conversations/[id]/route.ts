// GET /api/desk/conversations/[id]
// Retorna a conversa com histórico completo de mensagens e dados do contato.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request)
  if (blocked) return blocked

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

  // Cursor-based pagination: ?before=<message_id>&limit=50
  const beforeId = request.nextUrl.searchParams.get('before')
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? '50'), 1), 100)

  // Inclui mensagens com client_id null para não esconder históricos antigos/bugados.
  // A segurança já está garantida pelo filtro de conversation_id + validação de acesso acima.
  const msgSelect = 'id, content, content_type, sender_type, from_who, created_at, evolution_message_id, media_url, media_mime_type, media_filename, media_size_bytes, media_duration_seconds, media_transcript, whatsapp_status'

  let msgQuery = admin
    .from('messages')
    .select(msgSelect)
    .eq('conversation_id', id)

  if (conversation.client_id) {
    msgQuery = msgQuery.or(`client_id.eq.${conversation.client_id},client_id.is.null`)
  }

  if (beforeId) {
    // Fetch the cursor message's timestamp
    const { data: cursorMsg } = await admin
      .from('messages')
      .select('created_at')
      .eq('id', beforeId)
      .maybeSingle()

    if (cursorMsg) {
      msgQuery = msgQuery.lt('created_at', cursorMsg.created_at)
    }
  }

  // Fetch limit+1 to determine hasMore, ordered DESC (newest first in query)
  const { data: rawMessages, error: msgError } = await msgQuery
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (msgError) {
    console.error(`[desk/conversations/${id}] Erro ao buscar mensagens: ${msgError.message}`)
    return NextResponse.json({ error: 'Erro ao buscar mensagens', conversation }, { status: 500 })
  }

  const fetched = rawMessages ?? []
  const hasMore = fetched.length > limit
  const sliced = hasMore ? fetched.slice(0, limit) : fetched
  // Reverse to chronological order (oldest first)
  const messages = sliced.reverse()

  console.log(`[desk/conversations/${id}] ${messages.length} mensagem(ns) retornada(s), hasMore=${hasMore}`)

  return NextResponse.json({
    conversation,
    messages,
    hasMore,
    oldestMessageId: messages.length > 0 ? messages[0].id : null,
  })
}
