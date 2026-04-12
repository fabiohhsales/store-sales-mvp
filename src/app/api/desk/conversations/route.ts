// GET /api/desk/conversations?stage=all|bot_triage|awaiting_human|in_service|resolved
// Lista conversas do cliente com contato e última mensagem.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const stage = request.nextUrl.searchParams.get('stage') ?? 'all'
  const journeyStageFilter = request.nextUrl.searchParams.get('journey_stage') ?? null
  const handoffReasonFilter = request.nextUrl.searchParams.get('handoff_reason_code') ?? null
  console.log('[desk/conversations] clientId=%s stage=%s journey=%s reason=%s', deskUser.clientId, stage, journeyStageFilter, handoffReasonFilter)
  const admin = createAdminClient()

  const baseSelect = `
    id, stage, status, labels, summary, assigned_operator_id,
    last_incoming_at, last_outgoing_at, last_outgoing_by, stage_changed_at,
    journey_stage, handoff_reason_code,
    contacts ( id, name, phone_number )
  `

  let query = admin
    .from('conversations')
    .select(baseSelect)
    .eq('client_id', deskUser.clientId)
    .order('last_incoming_at', { ascending: false, nullsFirst: false })

  if (stage === 'resolved') {
    query = query.eq('stage', 'resolved')
  } else if (stage !== 'all') {
    // filtro específico: bot_triage | awaiting_human | in_service
    query = query.eq('stage', stage)
  } else {
    // 'all' = tudo exceto resolved (inclui stage IS NULL para conversas legadas)
    query = query.or('stage.neq.resolved,stage.is.null')
  }

  if (journeyStageFilter) {
    query = query.eq('journey_stage', journeyStageFilter)
  }
  if (handoffReasonFilter) {
    query = query.eq('handoff_reason_code', handoffReasonFilter)
  }

  const { data, error } = await query.limit(100)
  if (error) {
    console.error('[desk/conversations] query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[desk/conversations] returned %d conversations', (data ?? []).length)
  return NextResponse.json(data ?? [])
}
