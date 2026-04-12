'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, BarChart3, Clock, AlertTriangle, CheckCircle2, Users, TrendingUp, Download, Timer, Hourglass } from 'lucide-react'

interface AnalyticsData {
  period: string
  from: string
  stageCounts: { bot_triage: number; awaiting_human: number; in_service: number }
  totalResolved: number
  newConversations: number
  avgResolutionMinutes: number | null
  operatorCounts: Record<string, number>
  operatorNames: Record<string, string>
  awaitingLong: number
}

interface SlaStats {
  count: number
  avg: number | null
  median: number | null
  p95: number | null
  max: number | null
}

interface SlaData {
  period: { days: number; since: string }
  total: number
  resolved: number
  waitTime: SlaStats
  serviceTime: SlaStats
  volumeByDay: Record<string, number>
  stageDistribution: Record<string, number>
}

type Period = 'today' | 'week' | 'month'

interface Props {
  clientId: string
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 bg-card ${
        highlight ? 'border-destructive/50 bg-destructive/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${highlight ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}

function StageBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-44 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
        {value > 0 && (
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 4)}%` }} />
        )}
      </div>
      <span className="text-xs font-medium text-foreground w-6 text-right flex-shrink-0">
        {value}
      </span>
    </div>
  )
}

export function AnalyticsView({ clientId }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [sla, setSla] = useState<SlaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')
  const [exporting, setExporting] = useState(false)

  const slaDays = { today: 1, week: 7, month: 30 }[period]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [analyticsRes, slaRes] = await Promise.all([
        fetch(`/api/desk/analytics?client_id=${clientId}&period=${period}`),
        fetch(`/api/desk/stats/sla?days=${slaDays}`),
      ])
      if (analyticsRes.ok) setData(await analyticsRes.json())
      if (slaRes.ok) setSla(await slaRes.json())
    } finally {
      setLoading(false)
    }
  }, [clientId, period, slaDays])

  useEffect(() => { void load() }, [load])

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/desk/analytics/export?client_id=${clientId}&period=${period}`)
      if (!res.ok) throw new Error('Falha ao gerar export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conversas-${period}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar dados')
    } finally {
      setExporting(false)
    }
  }

  const periodLabel = { today: 'Hoje', week: 'Últimos 7 dias', month: 'Este mês' }[period]

  const totalActive = data
    ? data.stageCounts.bot_triage + data.stageCounts.awaiting_human + data.stageCounts.in_service
    : 0

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
          <p className="text-xs text-muted-foreground mt-0.5">SLA e métricas operacionais</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border p-1 bg-card">
            {(['today', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {{ today: 'Hoje', week: '7 dias', month: 'Mês' }[p]}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            title="Exportar CSV das conversas resolvidas"
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Carregando métricas...
        </div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">Erro ao carregar analytics.</div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={<CheckCircle2 size={18} className="text-green-500" />}
              label="Resolvidas"
              value={String(data.totalResolved)}
              sub={periodLabel}
            />
            <MetricCard
              icon={<TrendingUp size={18} className="text-blue-500" />}
              label="Novas conversas"
              value={String(data.newConversations)}
              sub={periodLabel}
            />
            <MetricCard
              icon={<Clock size={18} className="text-primary" />}
              label="Tempo médio de resolução"
              value={formatMinutes(data.avgResolutionMinutes)}
              sub={
                data.totalResolved > 0
                  ? `em ${data.totalResolved} resolvidas`
                  : 'sem dados no período'
              }
            />
            <MetricCard
              icon={<AlertTriangle size={18} className="text-destructive" />}
              label="Aguardando há +1h"
              value={String(data.awaitingLong)}
              sub="risco de SLA"
              highlight={data.awaitingLong > 0}
            />
          </div>

          {/* Fila atual por estágio */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
              <BarChart3 size={15} className="text-primary" />
              Fila atual por estágio
            </h2>
            <div className="space-y-3">
              <StageBar
                label="Bot respondendo"
                value={data.stageCounts.bot_triage}
                max={totalActive}
                color="bg-muted-foreground/50"
              />
              <StageBar
                label="Aguardando operador"
                value={data.stageCounts.awaiting_human}
                max={totalActive}
                color="bg-destructive"
              />
              <StageBar
                label="Em atendimento"
                value={data.stageCounts.in_service}
                max={totalActive}
                color="bg-primary"
              />
            </div>
            {totalActive === 0 && (
              <p className="text-xs text-muted-foreground mt-3">Nenhuma conversa ativa no momento.</p>
            )}
          </div>

          {/* Resoluções por operador */}
          {Object.keys(data.operatorCounts).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                <Users size={15} className="text-primary" />
                Resoluções por operador — {periodLabel}
              </h2>
              <div className="space-y-2.5">
                {Object.entries(data.operatorCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([opId, count]) => {
                    const name =
                      opId === 'unassigned'
                        ? 'Sem responsável'
                        : (data.operatorNames[opId] ?? opId.slice(0, 8) + '…')
                    const pct = data.totalResolved > 0
                      ? Math.round((count / data.totalResolved) * 100)
                      : 0
                    return (
                      <div key={opId} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground truncate w-40 flex-shrink-0">
                          {name}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground w-12 text-right flex-shrink-0">
                          {count} ({pct}%)
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* SLA Dashboard */}
          {sla && (
            <>
              {/* SLA KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  icon={<Timer size={18} className="text-amber-500" />}
                  label="Espera média (fila → atendimento)"
                  value={formatMinutes(sla.waitTime.avg)}
                  sub={sla.waitTime.count > 0 ? `em ${sla.waitTime.count} atendimentos` : 'sem dados'}
                  highlight={sla.waitTime.avg !== null && sla.waitTime.avg > 30}
                />
                <MetricCard
                  icon={<Hourglass size={18} className="text-purple-500" />}
                  label="Espera P95"
                  value={formatMinutes(sla.waitTime.p95)}
                  sub={sla.waitTime.max !== null ? `máx ${formatMinutes(sla.waitTime.max)}` : '—'}
                  highlight={sla.waitTime.p95 !== null && sla.waitTime.p95 > 60}
                />
                <MetricCard
                  icon={<Clock size={18} className="text-teal-500" />}
                  label="Atendimento médio"
                  value={formatMinutes(sla.serviceTime.avg)}
                  sub={sla.serviceTime.count > 0 ? `em ${sla.serviceTime.count} resolvidas` : 'sem dados'}
                />
                <MetricCard
                  icon={<CheckCircle2 size={18} className="text-green-500" />}
                  label="Total no período"
                  value={String(sla.total)}
                  sub={`${sla.resolved} resolvidas`}
                />
              </div>

              {/* Volume by day */}
              {Object.keys(sla.volumeByDay).length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                    <BarChart3 size={15} className="text-primary" />
                    Volume diário
                  </h2>
                  <div className="flex items-end gap-1 h-24">
                    {Object.entries(sla.volumeByDay)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([day, count]) => {
                        const maxCount = Math.max(...Object.values(sla.volumeByDay))
                        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
                        return (
                          <div key={day} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] text-muted-foreground">{count}</span>
                            <div
                              className="w-full bg-primary/80 rounded-t-sm min-h-[2px]"
                              style={{ height: `${Math.max(pct, 3)}%` }}
                            />
                            <span className="text-[9px] text-muted-foreground/60">
                              {day.slice(8)}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
