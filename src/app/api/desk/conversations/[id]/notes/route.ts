// GET  /api/desk/conversations/[id]/notes — lista notas internas da conversa
// POST /api/desk/conversations/[id]/notes — cria nova nota interna

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

// ---------------------------------------------------------------------------
// GET — lista notas, ordem cronológica crescente
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Valida acesso via conversa
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('conversation_operator_notes')
    .select('id, content, operator_email, operator_name, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[notes] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// ---------------------------------------------------------------------------
// POST — cria nota; operador e client_id vêm do deskUser autenticado
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const content: string = typeof body.content === 'string' ? body.content.trim() : ''

  if (!content) {
    return NextResponse.json({ error: 'Conteúdo da nota não pode ser vazio' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Valida acesso e obtém client_id
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Resolve display_name do operador (se tiver panel_users)
  const { data: panelUser } = await admin
    .from('panel_users')
    .select('email, display_name')
    .eq('id', deskUser.userId)
    .maybeSingle()

  const operatorEmail = panelUser?.email ?? deskUser.userId
  const operatorName = panelUser?.display_name ?? null

  const { data, error } = await admin
    .from('conversation_operator_notes')
    .insert({
      conversation_id: conversationId,
      client_id: conv.client_id,
      operator_user_id: deskUser.userId,
      operator_email: operatorEmail,
      operator_name: operatorName,
      content,
    })
    .select('id, content, operator_email, operator_name, created_at')
    .single()

  if (error) {
    console.error('[notes] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
