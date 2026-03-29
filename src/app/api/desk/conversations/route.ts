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
  const admin = createAdminClient()

  let query = admin
    .from('conversations')
    .select(`
      id,
      stage,
      status,
      labels,
      summary,
      assigned_operator_id,
      last_incoming_at,
      last_outgoing_at,
      last_outgoing_by,
      created_at,
      contacts ( id, name, phone_number )
    `)
    .eq('client_id', deskUser.clientId)
    .neq('stage', 'resolved')
    .order('last_incoming_at', { ascending: false, nullsFirst: false })

  if (stage !== 'all' && stage !== 'resolved') {
    query = query.eq('stage', stage)
  } else if (stage === 'resolved') {
    query = admin
      .from('conversations')
      .select(`
        id, stage, status, labels, summary, assigned_operator_id,
        last_incoming_at, last_outgoing_at, last_outgoing_by, created_at,
        contacts ( id, name, phone_number )
      `)
      .eq('client_id', deskUser.clientId)
      .eq('stage', 'resolved')
      .order('last_incoming_at', { ascending: false, nullsFirst: false })
      .limit(50)
  }

  const { data, error } = await query.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
