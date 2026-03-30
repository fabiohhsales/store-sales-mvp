// GET  /api/desk/conversations/[id]/contact — perfil completo do contato
// PATCH /api/desk/conversations/[id]/contact — atualiza nome ou custom_data do contato

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

// ---------------------------------------------------------------------------
// GET — perfil do contato: dados base + histórico de conversas + agendamentos
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // 1. Busca a conversa para descobrir o contact_id e validar acesso
  const { data: conv, error: convError } = await admin
    .from('conversations')
    .select('id, client_id, contact_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (!conv.contact_id) {
    return NextResponse.json({ error: 'Conversa sem contato vinculado' }, { status: 404 })
  }

  // 2. Dados do contato
  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .select('id, name, phone_number, identifier, custom_data, intake_completed_at, created_at')
    .eq('id', conv.contact_id)
    .maybeSingle()

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
  if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })

  // 3. Histórico de conversas deste contato neste cliente (exclui a conversa atual)
  const { data: conversations } = await admin
    .from('conversations')
    .select('id, stage, status, summary, last_incoming_at, created_at')
    .eq('contact_id', conv.contact_id)
    .eq('client_id', conv.client_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // 4. Agendamentos do contato (próximos + histórico recente)
  const { data: appointments } = await admin
    .from('appointments')
    .select('id, conversation_id, title, start_at, end_at, modality, status, meet_link')
    .eq('contact_id', conv.contact_id)
    .order('start_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    contact,
    conversations: conversations ?? [],
    appointments: appointments ?? [],
  })
}

// ---------------------------------------------------------------------------
// PATCH — atualiza nome e/ou custom_data do contato
// ---------------------------------------------------------------------------
export async function PATCH(
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
    .select('id, client_id, contact_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (!conv.contact_id) return NextResponse.json({ error: 'Conversa sem contato' }, { status: 404 })

  const body = await request.json()

  // Whitelist de campos editáveis pelo operador
  const allowed: Record<string, unknown> = {}
  if ('name' in body && typeof body.name === 'string') {
    allowed.name = body.name.trim() || null
  }
  if ('custom_data' in body && typeof body.custom_data === 'object' && body.custom_data !== null) {
    // Merge incremental — operador pode sobrescrever chaves individualmente
    const { data: current } = await admin
      .from('contacts')
      .select('custom_data')
      .eq('id', conv.contact_id)
      .maybeSingle()
    allowed.custom_data = { ...(current?.custom_data ?? {}), ...body.custom_data }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('contacts')
    .update(allowed)
    .eq('id', conv.contact_id)
    .select('id, name, phone_number, identifier, custom_data, intake_completed_at, created_at')
    .single()

  if (error) {
    console.error('[desk/contact] PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
