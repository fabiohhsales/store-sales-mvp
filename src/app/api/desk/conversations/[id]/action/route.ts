// POST /api/desk/conversations/[id]/action
// Ações do operador: assume | return | resolve
// Body: { action: 'assume' | 'return' | 'resolve' }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'
import { RATE_LIMITS } from '@/lib/desk/rate-limit'
import { emitConversationEvent } from '@/lib/desk/emit-conversation-event'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, RATE_LIMITS.send)
  if (blocked) return blocked

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

  let newStage: string = conv.stage

  if (action === 'assume') {
    await admin.from('ai_pauses').upsert({
      conversation_id: id,
      paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      paused_reason: 'operator_assumed',
      paused_by: deskUser.userId,
      updated_at: new Date().toISOString(),
      client_id: conv.client_id,
    })

    const { data, error } = await admin.from('conversations')
      .update({
        stage: 'in_service',
        last_system_action: 'operator_assumed',
        handoff_assumed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('stage')
      .single()
    if (error) {
      console.error('[desk/action] assume error:', error.message)
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }
    newStage = data.stage

    emitConversationEvent(id, conv.client_id, 'handoff_assumed', 'operator', {
      previous_stage: conv.stage,
    }, deskUser.userId)
  }

  if (action === 'return') {
    await admin.from('ai_pauses').delete().eq('conversation_id', id)

    const { data, error } = await admin.from('conversations')
      .update({
        stage: 'bot_triage',
        handoff_returned_to_bot_at: new Date().toISOString(),
        last_system_action: 'returned_to_bot',
      })
      .eq('id', id)
      .select('stage')
      .single()
    if (error) {
      console.error('[desk/action] return error:', error.message)
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }
    newStage = data.stage

    emitConversationEvent(id, conv.client_id, 'returned_to_bot', 'operator', {
      previous_stage: conv.stage,
    }, deskUser.userId)
  }

  if (action === 'resolve') {
    await admin.from('ai_pauses').delete().eq('conversation_id', id)

    const { data, error } = await admin.from('conversations')
      .update({
        stage: 'resolved',
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        last_system_action: 'conversation_resolved',
      })
      .eq('id', id)
      .select('stage')
      .single()
    if (error) {
      console.error('[desk/action] resolve error:', error.message)
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }
    newStage = data.stage

    emitConversationEvent(id, conv.client_id, 'conversation_resolved', 'operator', {
      previous_stage: conv.stage,
    }, deskUser.userId)
  }

  console.log(`[desk/action] conv=${id} action=${action} stage=${newStage}`)
  return NextResponse.json({ ok: true, action, stage: newStage })
}
