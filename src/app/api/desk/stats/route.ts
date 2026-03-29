// GET /api/desk/stats?client_id=
// Contadores por stage para o rodapé do Desk.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  const { data } = await admin
    .from('conversations')
    .select('stage')
    .eq('client_id', deskUser.clientId)
    .neq('stage', 'resolved')

  const counts = { bot_triage: 0, awaiting_human: 0, in_service: 0 }
  for (const row of data ?? []) {
    if (row.stage in counts) counts[row.stage as keyof typeof counts]++
  }

  return NextResponse.json(counts)
}
