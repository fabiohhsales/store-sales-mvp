// GET /api/desk/conversations/[id]
// Retorna a conversa da loja com histórico completo de mensagens e dados do contato.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'

interface StoreConvDetailRow {
  id: string
  operational_status: string | null
  commercial_stage: string | null
  summary: string | null
  assigned_user_id: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  account_id: string
  contact: {
    id: string
    name: string | null
    phone_number: string | null
    custom_data: any
  } | null
}

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

  // Busca conversa na tabela store_conversations
  const { data: rawConversation, error } = await admin
    .from('store_conversations')
    .select(`
      id,
      operational_status,
      commercial_stage,
      summary,
      assigned_user_id,
      last_incoming_at,
      last_outgoing_at,
      account_id,
      contact:store_contacts ( id, name, phone_number, custom_data )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[desk/conversations] detail error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
  if (!rawConversation) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const conversationRow = rawConversation as unknown as StoreConvDetailRow

  // Valida que o operador tem acesso a esta conta
  if (!deskUser.isAdmin && conversationRow.account_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Mapeia para o formato esperado pelo frontend
  const conversation = {
    id: conversationRow.id,
    stage: conversationRow.operational_status === 'bot_active' ? 'bot_triage' : conversationRow.operational_status,
    status: conversationRow.operational_status === 'resolved' ? 'resolved' : 'open',
    labels: conversationRow.commercial_stage ? [conversationRow.commercial_stage] : [],
    summary: conversationRow.summary,
    assigned_operator_id: conversationRow.assigned_user_id,
    last_incoming_at: conversationRow.last_incoming_at,
    last_outgoing_at: conversationRow.last_outgoing_at,
    client_id: conversationRow.account_id,
    contacts: conversationRow.contact
      ? [
          {
            id: conversationRow.contact.id,
            name: conversationRow.contact.name,
            phone_number: conversationRow.contact.phone_number,
            identifier: conversationRow.contact.phone_number,
            custom_data: conversationRow.contact.custom_data,
          },
        ]
      : [],
  }

  // Cursor-based pagination: ?before=<message_id>&limit=50
  const beforeId = request.nextUrl.searchParams.get('before')
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? '50'), 1), 100)

  let msgQuery = admin
    .from('store_messages')
    .select('id, content, content_type, sender_type, from_who, created_at, evolution_message_id, media_url, media_mime_type, whatsapp_status, ai_input_text')
    .eq('conversation_id', id)

  if (beforeId) {
    // Busca timestamp da mensagem de cursor
    const { data: cursorMsg } = await admin
      .from('store_messages')
      .select('created_at')
      .eq('id', beforeId)
      .maybeSingle()

    if (cursorMsg) {
      msgQuery = msgQuery.lt('created_at', cursorMsg.created_at)
    }
  }

  // Busca limit+1 para determinar hasMore
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
  
  // Mapeamento mínimo para compatibilidade com o frontend
  const messages = sliced.reverse().map((msg) => ({
    ...msg,
    // Garante que campos que o front lê existam
    derived_text: null,
    derived_kind: null,
    processing_status: 'ready',
    processing_error: null,
  }))

  console.log(`[desk/conversations/${id}] ${messages.length} mensagem(ns) retornada(s), hasMore=${hasMore}`)

  return NextResponse.json({
    conversation,
    messages,
    hasMore,
    oldestMessageId: messages.length > 0 ? messages[0].id : null,
  })
}
