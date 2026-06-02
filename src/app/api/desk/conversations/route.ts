// GET /api/desk/conversations?stage=all|bot_triage|awaiting_human|in_service|resolved
// Lista conversas do cliente com contato e última mensagem para o Desk (Store Sales).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'

interface StoreConvRow {
  id: string
  operational_status: string | null
  commercial_stage: string | null
  summary: string | null
  assigned_user_id: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  contact: {
    id: string
    name: string | null
    phone_number: string | null
  } | null
}

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request)
  if (blocked) return blocked

  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const stage = request.nextUrl.searchParams.get('stage') ?? 'all'
  console.log('[desk/conversations] accountId=%s stage=%s', deskUser.clientId, stage)
  const admin = createAdminClient()

  const baseSelect = `
    id,
    operational_status,
    commercial_stage,
    summary,
    assigned_user_id,
    last_incoming_at,
    last_outgoing_at,
    contact:store_contacts ( id, name, phone_number )
  `

  let query = admin
    .from('store_conversations')
    .select(baseSelect)
    .eq('account_id', deskUser.clientId)
    .order('last_incoming_at', { ascending: false, nullsFirst: false })

  if (stage === 'resolved') {
    query = query.eq('operational_status', 'resolved')
  } else if (stage !== 'all') {
    // filtro específico: bot_active | awaiting_human | in_service
    // maps legacy bot_triage to bot_active
    const operationalStage = stage === 'bot_triage' ? 'bot_active' : stage
    query = query.eq('operational_status', operationalStage)
  } else {
    // 'all' = tudo exceto resolved
    query = query.neq('operational_status', 'resolved')
  }

  const { data, error } = await query.limit(100)
  if (error) {
    console.error('[desk/conversations] query error:', error.message)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  const typedData = (data ?? []) as unknown as StoreConvRow[]

  // Mapeia para o formato esperado pelo Desk frontend
  const mapped = typedData.map((row) => ({
    id: row.id,
    stage: row.operational_status === 'bot_active' ? 'bot_triage' : row.operational_status,
    status: row.operational_status === 'resolved' ? 'resolved' : 'open',
    labels: row.commercial_stage ? [row.commercial_stage] : [],
    summary: row.summary,
    assigned_operator_id: row.assigned_user_id,
    last_incoming_at: row.last_incoming_at,
    last_outgoing_at: row.last_outgoing_at,
    contacts: row.contact ? [row.contact] : [],
  }))

  console.log('[desk/conversations] returned %d conversations', mapped.length)
  return NextResponse.json(mapped)
}
