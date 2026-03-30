// GET /api/desk/analytics?client_id=&period=today|week|month
// Retorna métricas de SLA e atendimento para o painel de analytics.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

function periodStart(period: string): Date {
  const now = new Date()
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  // default: week — últimos 7 dias
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
}

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const period = request.nextUrl.searchParams.get('period') ?? 'week'
  const from = periodStart(period)
  const admin = createAdminClient()

  // 1. Contagem por stage (conversas ativas no momento)
  const { data: stageRows } = await admin
    .from('conversations')
    .select('stage')
    .eq('client_id', deskUser.clientId)
    .neq('stage', 'resolved')

  const stageCounts: Record<string, number> = { bot_triage: 0, awaiting_human: 0, in_service: 0 }
  for (const row of stageRows ?? []) {
    if (row.stage in stageCounts) stageCounts[row.stage]++
  }

  // 2. Conversas resolvidas no período
  const { data: resolvedRows } = await admin
    .from('conversations')
    .select('created_at, resolved_at, assigned_operator_id')
    .eq('client_id', deskUser.clientId)
    .eq('stage', 'resolved')
    .gte('resolved_at', from.toISOString())
    .not('resolved_at', 'is', null)

  const resolved = resolvedRows ?? []

  // 3. Tempo médio de resolução (minutos)
  let totalMinutes = 0
  let countWithTime = 0
  for (const row of resolved) {
    if (row.resolved_at && row.created_at) {
      const diff = new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()
      if (diff > 0) {
        totalMinutes += diff / 60000
        countWithTime++
      }
    }
  }
  const avgResolutionMinutes = countWithTime > 0 ? Math.round(totalMinutes / countWithTime) : null

  // 4. Distribuição por operador
  const operatorCounts: Record<string, number> = {}
  for (const row of resolved) {
    const opId = row.assigned_operator_id ?? 'unassigned'
    operatorCounts[opId] = (operatorCounts[opId] ?? 0) + 1
  }

  // 5. Nomes dos operadores
  const operatorIds = Object.keys(operatorCounts).filter((id) => id !== 'unassigned')
  const operatorNames: Record<string, string> = {}
  if (operatorIds.length > 0) {
    const { data: ops } = await admin
      .from('panel_users')
      .select('id, display_name, email')
      .in('id', operatorIds)
    for (const op of ops ?? []) {
      operatorNames[op.id] = (op.display_name as string | null) ?? (op.email as string)
    }
  }

  // 6. Novas conversas criadas no período
  const { count: newConversations } = await admin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', deskUser.clientId)
    .gte('created_at', from.toISOString())

  // 7. Aguardando há mais de 1 hora — risco de SLA
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: awaitingLong } = await admin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', deskUser.clientId)
    .eq('stage', 'awaiting_human')
    .lt('last_incoming_at', oneHourAgo)

  return NextResponse.json({
    period,
    from: from.toISOString(),
    stageCounts,
    totalResolved: resolved.length,
    newConversations: newConversations ?? 0,
    avgResolutionMinutes,
    operatorCounts,
    operatorNames,
    awaitingLong: awaitingLong ?? 0,
  })
}
