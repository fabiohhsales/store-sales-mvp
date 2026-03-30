// GET /api/desk/analytics/export?client_id=&period=today|week|month
// Retorna um CSV de conversas resolvidas no período.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

function periodStart(period: string): Date {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
}

function esc(v: string | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function fmtMinutes(ms: number | null): string {
  if (ms === null) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${m}min`
}

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const period = request.nextUrl.searchParams.get('period') ?? 'week'
  const from = periodStart(period)
  const admin = createAdminClient()

  // Conversas resolvidas no período com contato + operador atribuído
  const { data: rows, error } = await admin
    .from('conversations')
    .select(`
      id, stage, created_at, resolved_at, assigned_operator_id, summary, labels,
      contacts ( name, phone_number )
    `)
    .eq('client_id', deskUser.clientId)
    .eq('stage', 'resolved')
    .gte('resolved_at', from.toISOString())
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(1000)

  if (error) {
    return NextResponse.json({ error: 'Erro ao gerar export' }, { status: 500 })
  }

  // Resolve nomes dos operadores
  const operatorIds = [...new Set((rows ?? []).map((r) => r.assigned_operator_id).filter(Boolean))]
  const operatorNames: Record<string, string> = {}
  if (operatorIds.length > 0) {
    const { data: ops } = await admin
      .from('panel_users')
      .select('id, display_name, email')
      .in('id', operatorIds as string[])
    for (const op of ops ?? []) {
      operatorNames[op.id] = (op.display_name as string | null) ?? (op.email as string)
    }
  }

  const header = ['ID', 'Contato', 'Telefone', 'Criada em', 'Resolvida em', 'Tempo (resolução)', 'Operador', 'Tags', 'Resumo']
  const csvRows = [header.join(',')]

  for (const row of rows ?? []) {
    const contact = (row.contacts as unknown as { name: string | null; phone_number: string | null } | null)
    const resolutionMs = row.resolved_at && row.created_at
      ? new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()
      : null
    const operatorName = row.assigned_operator_id
      ? (operatorNames[row.assigned_operator_id] ?? row.assigned_operator_id)
      : ''

    csvRows.push([
      esc(row.id),
      esc(contact?.name),
      esc(contact?.phone_number),
      esc(new Date(row.created_at).toLocaleString('pt-BR')),
      esc(row.resolved_at ? new Date(row.resolved_at).toLocaleString('pt-BR') : ''),
      esc(fmtMinutes(resolutionMs)),
      esc(operatorName),
      esc(Array.isArray(row.labels) ? (row.labels as string[]).join('; ') : ''),
      esc(row.summary),
    ].join(','))
  }

  const csv = csvRows.join('\n')
  const periodLabel = { today: 'hoje', week: '7dias', month: 'mes' }[period] ?? period

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="conversas-${periodLabel}.csv"`,
    },
  })
}
