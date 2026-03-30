// GET  /api/desk/my-canned-responses?client_id=  — lista respostas pessoais do operador logado
// POST /api/desk/my-canned-responses?client_id=  — cria resposta pessoal

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('canned_responses')
    .select('id, shortcut, content, created_at, updated_at')
    .eq('client_id', deskUser.clientId)
    .eq('operator_user_id', deskUser.userId)
    .order('shortcut', { ascending: true })

  if (error) {
    console.error('[my-canned-responses] GET error:', error)
    return NextResponse.json({ error: 'Erro ao listar respostas pessoais' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { shortcut, content } = body as { shortcut?: string; content?: string }

  if (!shortcut?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'shortcut e content são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('canned_responses')
    .insert({
      client_id: deskUser.clientId,
      operator_user_id: deskUser.userId,
      shortcut: shortcut.trim().toLowerCase().replace(/^\/+/, ''),
      content: content.trim(),
    })
    .select('id, shortcut, content, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Você já tem um atalho com este nome' }, { status: 409 })
    }
    console.error('[my-canned-responses] POST error:', error)
    return NextResponse.json({ error: 'Erro ao criar resposta pessoal' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
