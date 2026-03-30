// GET  /api/clients/[id]/canned-responses — lista respostas rápidas do cliente
// POST /api/clients/[id]/canned-responses — cria nova resposta rápida

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('canned_responses')
    .select('id, shortcut, content, created_at, updated_at')
    .eq('client_id', clientId)
    .order('shortcut', { ascending: true })

  if (error) {
    console.error('[canned-responses] GET error:', error)
    return NextResponse.json({ error: 'Erro ao listar respostas rápidas' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId } = await params
  const body = await request.json().catch(() => ({}))
  const { shortcut, content } = body as { shortcut?: string; content?: string }

  if (!shortcut?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'shortcut e content são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('canned_responses')
    .insert({
      client_id: clientId,
      shortcut: shortcut.trim().toLowerCase().replace(/^\/+/, ''),
      content: content.trim(),
    })
    .select('id, shortcut, content, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Atalho já existe para este cliente' }, { status: 409 })
    }
    console.error('[canned-responses] POST error:', error)
    return NextResponse.json({ error: 'Erro ao criar resposta rápida' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
