// PATCH  /api/clients/[id]/canned-responses/[responseId] — atualiza resposta rápida
// DELETE /api/clients/[id]/canned-responses/[responseId] — remove resposta rápida

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId, responseId } = await params
  const body = await request.json().catch(() => ({}))
  const { shortcut, content } = body as { shortcut?: string; content?: string }

  if (!shortcut?.trim() && !content?.trim()) {
    return NextResponse.json({ error: 'Pelo menos um campo (shortcut ou content) deve ser fornecido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const updates: Record<string, string> = {}
  if (shortcut?.trim()) updates.shortcut = shortcut.trim().toLowerCase().replace(/^\/+/, '')
  if (content?.trim()) updates.content = content.trim()

  const { data, error } = await admin
    .from('canned_responses')
    .update(updates)
    .eq('id', responseId)
    .eq('client_id', clientId)
    .select('id, shortcut, content, created_at, updated_at')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Atalho já existe para este cliente' }, { status: 409 })
    }
    console.error('[canned-responses] PATCH error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar resposta rápida' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Resposta rápida não encontrada' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId, responseId } = await params
  const admin = createAdminClient()

  const { error } = await admin
    .from('canned_responses')
    .delete()
    .eq('id', responseId)
    .eq('client_id', clientId)

  if (error) {
    console.error('[canned-responses] DELETE error:', error)
    return NextResponse.json({ error: 'Erro ao remover resposta rápida' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
