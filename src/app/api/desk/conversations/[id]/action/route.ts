// POST /api/desk/conversations/[id]/action
// Ações do operador: assume | return | resolve no Desk (Store Sales).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'
import { RATE_LIMITS } from '@/lib/desk/rate-limit'

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
  const { data: conv } = await admin
    .from('store_conversations')
    .select('id, account_id, operational_status, commercial_stage')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.account_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  let newStatus: string = conv.operational_status || 'bot_active'
  const nowStr = new Date().toISOString()

  if (action === 'assume') {
    const { data, error } = await admin
      .from('store_conversations')
      .update({
        operational_status: 'in_service',
        assigned_user_id: deskUser.userId,
        updated_at: nowStr,
      })
      .eq('id', id)
      .select('operational_status')
      .single()

    if (error) {
      console.error('[desk/action] assume error:', error.message)
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }

    newStatus = data.operational_status
  }

  if (action === 'return') {
    const { data, error } = await admin
      .from('store_conversations')
      .update({
        operational_status: 'bot_active',
        assigned_user_id: null,
        updated_at: nowStr,
      })
      .eq('id', id)
      .select('operational_status')
      .single()

    if (error) {
      console.error('[desk/action] return error:', error.message)
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }

    newStatus = data.operational_status
  }

  if (action === 'resolve') {
    const { data, error } = await admin
      .from('store_conversations')
      .update({
        operational_status: 'resolved',
        commercial_stage: conv.commercial_stage === 'won' ? 'won' : 'resolved_conversation', // fallback or keep as won
        resolved_at: nowStr,
        updated_at: nowStr,
      })
      .eq('id', id)
      .select('operational_status')
      .single()

    if (error) {
      console.error('[desk/action] resolve error:', error.message)
      return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }

    newStatus = data.operational_status
  }

  console.log(`[desk/action] conv=${id} action=${action} status=${newStatus}`)
  
  // Retorna no formato esperado pelo Desk UI
  return NextResponse.json({
    ok: true,
    action,
    stage: newStatus === 'bot_active' ? 'bot_triage' : newStatus,
    auto_reply: { attempted: false, sent: false, reason: null },
  })
}
