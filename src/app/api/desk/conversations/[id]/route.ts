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
      assigned_operator_id, last_incoming_at, last_outgoing_at,
      client_id, created_at,
      contacts ( id, name, phone_number, identifier )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Valida que o operador tem acesso a este cliente
  if (!deskUser.isAdmin && conversation.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { data: messages } = await admin
    .from('messages')
    .select('id, content, content_type, sender_type, from_who, created_at, evolution_message_id')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  return NextResponse.json({ conversation, messages: messages ?? [] })
}
