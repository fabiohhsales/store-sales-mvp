'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, XCircle, Info, CheckCircle, RefreshCw } from 'lucide-react'
import type { SOCAlert } from '@/app/api/soc/route'

const SEVERITY = {
  critical: {
    Icon: XCircle,
    wrapperClass: 'border-red-200 bg-red-50',
    iconClass: 'text-red-500',
    badgeClass: 'bg-red-100 text-red-700',
    linkClass: 'text-red-700 border-red-300 hover:bg-red-100',
    label: 'Crítico',
  },
  warning: {
    Icon: AlertTriangle,
    wrapperClass: 'border-yellow-200 bg-yellow-50',
    iconClass: 'text-yellow-500',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    linkClass: 'text-yellow-700 border-yellow-300 hover:bg-yellow-100',
    label: 'Atenção',
  },
  info: {
    Icon: Info,
    wrapperClass: 'border-blue-200 bg-blue-50',
    iconClass: 'text-blue-500',
    badgeClass: 'bg-blue-100 text-blue-700',
    linkClass: 'text-blue-700 border-blue-300 hover:bg-blue-100',
    label: 'Info',
  },
} as const

export function SOCPanel() {
  const [alerts, setAlerts] = useState<SOCAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function refresh() {
    try {
      const res = await fetch('/api/soc')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAlerts(data.alerts ?? [])
      setCheckedAt(data.checked_at ?? null)
      setFetchError(null)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [])

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length
  const checkedTime = checkedAt
    ? new Date(checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">Verificando sistemas...</span>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <XCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm text-red-700">Erro ao verificar sistemas: {fetchError}</span>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">Todos os sistemas operacionais</p>
          <p className="text-xs text-green-600">Nenhum alerta ativo</p>
        </div>
        {checkedTime && (
          <span className="shrink-0 text-xs text-green-600">Verificado {checkedTime}</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Centro de Alertas</h2>
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
              {warningCount} aviso{warningCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {checkedTime && (
          <span className="text-xs text-muted-foreground">Atualizado {checkedTime}</span>
        )}
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const { Icon, wrapperClass, iconClass, badgeClass, linkClass, label } =
            SEVERITY[alert.severity]
          return (
            <div
              key={alert.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${wrapperClass}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {alert.client_name}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                    {label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p>
              </div>
              <Link
                href={alert.action_url}
                className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${linkClass}`}
              >
                Ver →
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
