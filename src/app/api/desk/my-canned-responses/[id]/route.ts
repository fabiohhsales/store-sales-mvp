// PATCH  /api/desk/my-canned-responses/[id]?client_id=  — atualiza resposta pessoal
// DELETE /api/desk/my-canned-responses/[id]?client_id=  — remove resposta pessoal

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { shortcut, content } = body as { shortcut?: string; content?: string }

  if (!shortcut?.trim() && !content?.trim()) {
    return NextResponse.json({ error: 'Pelo menos shortcut ou content deve ser fornecido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const updates: Record<string, string> = {}
  if (shortcut?.trim()) updates.shortcut = shortcut.trim().toLowerCase().replace(/^\/+/, '')
  if (content?.trim()) updates.content = content.trim()

  const { data, error } = await admin
    .from('canned_responses')
    .update(updates)
    .eq('id', id)
    .eq('client_id', deskUser.clientId)
    .eq('operator_user_id', deskUser.userId)
    .select('id, shortcut, content, created_at, updated_at')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Você já tem um atalho com este nome' }, { status: 409 })
    }
    console.error('[my-canned-responses] PATCH error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar resposta pessoal' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Resposta não encontrada' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const { id } = await params
  const admin = createAdminClient()

  const { error } = await admin
    .from('canned_responses')
    .delete()
    .eq('id', id)
    .eq('client_id', deskUser.clientId)
    .eq('operator_user_id', deskUser.userId)

  if (error) {
    console.error('[my-canned-responses] DELETE error:', error)
    return NextResponse.json({ error: 'Erro ao remover resposta pessoal' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
