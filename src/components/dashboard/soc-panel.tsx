'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, RefreshCw, XCircle, ArrowRight } from 'lucide-react'

interface SOCAlert {
  id: string
  client_id: string
  client_name: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  message: string
  action_url: string
}

interface SOCSummary {
  total: number
  bySeverity: {
    critical: number
    warning: number
    info: number
  }
}

export function SOCPanel() {
  const [alerts, setAlerts] = useState<SOCAlert[]>([])
  const [summary, setSummary] = useState<SOCSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function refresh() {
    try {
      const res = await fetch('/api/soc')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAlerts(data.alerts ?? [])
      setSummary(data.summary ?? null)
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
  const infoCount = alerts.filter((a) => a.severity === 'info').length
  const totalCount = summary?.total ?? alerts.length
  const critical = summary?.bySeverity.critical ?? criticalCount
  const warning = summary?.bySeverity.warning ?? warningCount
  const info = summary?.bySeverity.info ?? infoCount
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
          {checkedTime && <p className="mt-1 text-xs text-green-600">Verificado {checkedTime}</p>}
        </div>
        <Link
          href="/soc"
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
        >
          Abrir SOC
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">SOC</h2>
          <p className="text-xs text-muted-foreground">
            {totalCount} alerta{totalCount !== 1 ? 's' : ''} monitorado{totalCount !== 1 ? 's' : ''} no momento
          </p>
        </div>
        <Link
          href="/soc"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Abrir SOC
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-red-600">Críticos</p>
          <p className="text-lg font-semibold text-red-800">{critical}</p>
        </div>
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2">
          <p className="text-yellow-600">Avisos</p>
          <p className="text-lg font-semibold text-yellow-800">{warning}</p>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-blue-600">Info</p>
          <p className="text-lg font-semibold text-blue-800">{info}</p>
        </div>
      </div>

      {checkedTime && (
        <p className="mt-3 text-xs text-muted-foreground">Atualizado {checkedTime}</p>
      )}
    </div>
  )
}
