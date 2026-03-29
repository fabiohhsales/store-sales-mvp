// POST /api/desk/conversations/[id]/action
// Ações do operador: assume | return | resolve
// Body: { action: 'assume' | 'return' | 'resolve' }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { action } = await request.json()
  if (!['assume', 'return', 'resolve'].includes(action)) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Valida acesso à conversa
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id, stage')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (action === 'assume') {
    await admin.from('ai_pauses').upsert({
      conversation_id: id,
      paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      paused_reason: 'operator_assumed',
      paused_by: deskUser.userId,
      updated_at: new Date().toISOString(),
    })

    const { error } = await admin.from('conversations').update({
      stage: 'in_service',
      assigned_operator_id: deskUser.userId,
    }).eq('id', id)
    if (error) console.error('[desk/action] assume update error:', error.message)
  }

  if (action === 'return') {
    await admin.from('ai_pauses').delete().eq('conversation_id', id)

    const { error } = await admin.from('conversations').update({
      stage: 'bot_triage',
      assigned_operator_id: null,
    }).eq('id', id)
    if (error) console.error('[desk/action] return update error:', error.message)
  }

  if (action === 'resolve') {
    await admin.from('ai_pauses').delete().eq('conversation_id', id)

    const { error } = await admin.from('conversations').update({
      stage: 'resolved',
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      assigned_operator_id: null,
    }).eq('id', id)
    if (error) console.error('[desk/action] resolve update error:', error.message)
  }

  return NextResponse.json({ ok: true, action })
}
