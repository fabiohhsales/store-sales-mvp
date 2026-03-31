'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Calendar, CheckCircle, ExternalLink, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Stats {
  conversasAbertas: number
  agendamentosSemana: number
  resolvidasSemana: number
}

interface OperatorDashboardProps {
  clientId: string
  clientName: string
}

export function OperatorDashboard({ clientId, clientName }: OperatorDashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch desk stats
        const deskRes = await fetch(`/api/desk/stats?client_id=${clientId}`)
        const deskData = deskRes.ok ? await deskRes.json() : {}

        // Fetch agenda (this week)
        const now = new Date()
        const startOfWeek = new Date(now)
        startOfWeek.setDate(now.getDate() - now.getDay())
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)

        const agendaParams = new URLSearchParams({
          client_id: clientId,
          date_from: startOfWeek.toISOString().split('T')[0],
          date_to: endOfWeek.toISOString().split('T')[0],
        })
        const agendaRes = await fetch(`/api/agenda?${agendaParams}`)
        const agendaData = agendaRes.ok ? await agendaRes.json() : []

        setStats({
          conversasAbertas:
            (deskData.bot_triage || 0) +
            (deskData.awaiting_human || 0) +
            (deskData.in_service || 0),
          agendamentosSemana: Array.isArray(agendaData) ? agendaData.length : 0,
          resolvidasSemana: deskData.resolved || 0,
        })
      } catch {
        setStats({ conversasAbertas: 0, agendamentosSemana: 0, resolvidasSemana: 0 })
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [clientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const statCards = [
    {
      label: 'Conversas abertas',
      value: stats?.conversasAbertas ?? 0,
      icon: MessageSquare,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Agendamentos (semana)',
      value: stats?.agendamentosSemana ?? 0,
      icon: Calendar,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      label: 'Resolvidas (semana)',
      value: stats?.resolvidasSemana ?? 0,
      icon: CheckCircle,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Minha Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">{clientName}</p>
      </div>

      {/* Stats */}
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
