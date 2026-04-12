// GET /api/desk/stats/sla?days=7
// SLA metrics: wait-time (transfer → assume), service-time (assume → resolve), volumes

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'
import { RATE_LIMITS } from '@/lib/desk/rate-limit'

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, RATE_LIMITS.analytics)
  if (blocked) return blocked

  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const days = Math.min(Number(request.nextUrl.searchParams.get('days') ?? '7'), 90)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const admin = createAdminClient()

  // Fetch conversations with handoff data in the period
  const { data: convs, error } = await admin
    .from('conversations')
    .select('stage, handoff_transferred_at, handoff_assumed_at, resolved_at, created_at')
    .eq('client_id', deskUser.clientId)
    .gte('created_at', since)

  if (error) {
    console.error('[desk/stats/sla] query error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  const rows = convs ?? []

  // --- Wait time (transfer → assume) ---
  const waitMinutes: number[] = []
  for (const c of rows) {
    if (c.handoff_transferred_at && c.handoff_assumed_at) {
      const t0 = new Date(c.handoff_transferred_at).getTime()
      const t1 = new Date(c.handoff_assumed_at).getTime()
      if (!Number.isNaN(t0) && !Number.isNaN(t1)) {
        const diff = (t1 - t0) / 60000
        if (diff >= 0) waitMinutes.push(Math.round(diff))
      }
    }
  }

  // --- Service time (assume → resolve) ---
  const serviceMinutes: number[] = []
  for (const c of rows) {
    if (c.handoff_assumed_at && c.resolved_at) {
      const t0 = new Date(c.handoff_assumed_at).getTime()
      const t1 = new Date(c.resolved_at).getTime()
      if (!Number.isNaN(t0) && !Number.isNaN(t1)) {
        const diff = (t1 - t0) / 60000
        if (diff >= 0) serviceMinutes.push(Math.round(diff))
      }
    }
  }

  // --- Volume by day ---
  const volumeByDay: Record<string, number> = {}
  for (const c of rows) {
    const day = c.created_at?.slice(0, 10)
    if (day) volumeByDay[day] = (volumeByDay[day] ?? 0) + 1
  }

  // --- Stage distribution ---
  const stageDistribution: Record<string, number> = {}
  for (const c of rows) {
    stageDistribution[c.stage] = (stageDistribution[c.stage] ?? 0) + 1
  }

  return NextResponse.json({
    period: { days, since },
    total: rows.length,
    resolved: rows.filter(c => c.resolved_at).length,
    waitTime: computeStats(waitMinutes),
    serviceTime: computeStats(serviceMinutes),
    volumeByDay,
    stageDistribution,
  })
}

function computeStats(values: number[]) {
  if (values.length === 0) return { count: 0, avg: null, median: null, p95: null, max: null }
  const sorted = [...values].sort((a, b) => a - b)
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const max = sorted[sorted.length - 1]
  return { count: sorted.length, avg, median, p95, max }
}
