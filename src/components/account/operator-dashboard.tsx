'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Calendar, CheckCircle, ExternalLink, Loader2, Thermometer, Send } from 'lucide-react'
import Link from 'next/link'

interface FunnelLabel {
  slug: string
  display_name: string
  followup_cadence: string | null
}

interface FunnelData {
  stageCounts: { bot_triage: number; awaiting_human: number; in_service: number; resolved_week: number }
  temperatureCounts: { hot: number; warm: number; cold: number; frozen: number }
  followupSentWeek: { lead: number; atendimento: number; agendado: number }
  agendaWeek: { total: number; confirmed: number; scheduled: number; noshow: number }
  funnelCounts?: Record<string, number>
  funnelLabels?: FunnelLabel[]
}

const TEMPERATURE_CONFIG = [
  { key: 'hot' as const, label: 'Quente', color: 'bg-red-500', text: 'text-red-400', desc: '< 1 dia' },
  { key: 'warm' as const, label: 'Morno', color: 'bg-amber-500', text: 'text-amber-400', desc: '1–3 dias' },
  { key: 'cold' as const, label: 'Frio', color: 'bg-blue-500', text: 'text-blue-400', desc: '3–7 dias' },
  { key: 'frozen' as const, label: 'Gelado', color: 'bg-slate-500', text: 'text-slate-400', desc: '7+ dias' },
]

const CADENCE_CONFIG = [
  { key: 'lead' as const, label: 'Lead', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { key: 'atendimento' as const, label: 'Atendimento', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { key: 'agendado' as const, label: 'Agendado', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
]

interface OperatorDashboardProps {
  clientId: string
  clientName: string
}

export function OperatorDashboard({ clientId, clientName }: OperatorDashboardProps) {
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFunnel() {
      try {
        const res = await fetch(`/api/dashboard/funnel?client_id=${clientId}`)
        if (res.ok) setFunnel(await res.json())
      } catch {
        // silencia — UI mostra zeros
      } finally {
        setLoading(false)
      }
    }
    fetchFunnel()
  }, [clientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = funnel?.stageCounts
  const fc = funnel?.funnelCounts
  // Conta total ativo a partir dos funnelCounts (baseado em labels, não em stage)
  // para incluir conversas com stage null ou valores inesperados
  const totalAtivas = fc
    ? Object.values(fc).reduce((sum, v) => sum + v, 0)
    : (s?.bot_triage ?? 0) + (s?.awaiting_human ?? 0) + (s?.in_service ?? 0)

  const statCards = [
    {
      label: 'Conversas abertas',
      value: totalAtivas,
      icon: MessageSquare,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Agendamentos (próx. 7 dias)',
      value: funnel?.agendaWeek.total ?? 0,
      icon: Calendar,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      label: 'Resolvidas (7 dias)',
      value: s?.resolved_week ?? 0,
      icon: CheckCircle,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ]

  // Barra de temperatura: larguras proporcionais ao total ativo
  const tempTotal = totalAtivas || 1 // evita divisão por zero

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Minha Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">{clientName}</p>
      </div>

      {/* Cards de topo */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
              <div className={`rounded-lg p-2 ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Temperatura das conversas ativas */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Temperatura das conversas</span>
          <span className="ml-auto text-xs text-muted-foreground">por dias sem resposta do paciente</span>
        </div>

        {/* Barra proporcional */}
        {totalAtivas > 0 ? (
          <div className="flex h-3 overflow-hidden rounded-full gap-0.5">
            {TEMPERATURE_CONFIG.map(({ key, color }) => {
              const count = funnel?.temperatureCounts[key] ?? 0
              const pct = Math.round((count / tempTotal) * 100)
              if (pct === 0) return null
              return (
                <div
                  key={key}
                  className={`${color} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${pct}%`}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-3 rounded-full bg-muted" />
        )}

        {/* Legenda */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TEMPERATURE_CONFIG.map(({ key, label, text, desc }) => {
            const count = funnel?.temperatureCounts[key] ?? 0
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-lg font-bold ${text}`}>{count}</span>
                <div>
                  <p className="text-xs font-medium text-foreground leading-none">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Follow-ups enviados (7 dias) */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Follow-ups enviados</span>
            <span className="ml-auto text-xs text-muted-foreground">últimos 7 dias</span>
          </div>
          <div className="space-y-3">
            {CADENCE_CONFIG.map(({ key, label, color, bg }) => {
              const count = funnel?.followupSentWeek[key] ?? 0
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${bg.replace('/10', '')}`} />
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                  <span className={`text-sm font-bold ${color}`}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Agenda próximos 7 dias */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Agenda</span>
            <span className="ml-auto text-xs text-muted-foreground">próximos 7 dias</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-bold text-foreground">{funnel?.agendaWeek.total ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-muted-foreground">Confirmados</span>
              </div>
              <span className="text-sm font-bold text-emerald-400">{funnel?.agendaWeek.confirmed ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-sm text-muted-foreground">Agendados</span>
              </div>
              <span className="text-sm font-bold text-blue-400">{funnel?.agendaWeek.scheduled ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-muted-foreground">No-show</span>
              </div>
              <span className="text-sm font-bold text-red-400">{funnel?.agendaWeek.noshow ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Distribuição por etapa do funil */}
      {funnel?.funnelLabels && funnel.funnelLabels.length > 0 && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <span className="text-sm font-medium text-foreground">Distribuição por etapa</span>
          <div className="space-y-2">
            {funnel.funnelLabels.map((label) => {
              const count = fc?.[label.slug] ?? 0
              const pct = totalAtivas > 0 ? Math.round((count / totalAtivas) * 100) : 0
              return (
                <div key={label.slug} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 truncate">{label.display_name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-medium text-foreground w-8 text-right">{count}</span>
                </div>
              )
            })}
            {(fc?.['_sem_etapa'] ?? 0) > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 truncate">Sem etapa</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-muted-foreground/40 transition-all"
                    style={{ width: `${totalAtivas > 0 ? Math.round(((fc?.['_sem_etapa'] ?? 0) / totalAtivas) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground w-8 text-right">{fc?.['_sem_etapa'] ?? 0}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/pipeline"
          className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors group"
        >
          <div className="rounded-lg bg-primary/10 p-3">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground group-hover:text-primary transition-colors">Pipeline</p>
            <p className="text-xs text-muted-foreground">Ver todas as conversas no kanban</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/agenda"
          className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors group"
        >
          <div className="rounded-lg bg-emerald-500/10 p-3">
            <Calendar className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground group-hover:text-primary transition-colors">Agenda</p>
            <p className="text-xs text-muted-foreground">Ver agendamentos da semana</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}
