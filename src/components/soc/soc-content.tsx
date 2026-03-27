'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Shield, AlertTriangle, XCircle, CheckCircle, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ActivityChart } from './activity-chart'
import type { PanelAuditLog, PanelHealthCheck, PanelClientWithRelations } from '@/types/database'

// --- Tipos ---

type Period = '24h' | '7d' | '30d' | 'all'

interface ActivityPoint { date: string; count: number }

interface SOCContentProps {
  initialLogs: PanelAuditLog[]
  initialHealthChecks: PanelHealthCheck[]
  clients: PanelClientWithRelations[]
  clientMap: Record<string, string>
  criticalLogs: PanelAuditLog[]
  errorHealthChecks: PanelHealthCheck[]
  activityData: ActivityPoint[]
}

// --- Labels ---

const ACTION_LABELS: Record<string, string> = {
  client_created: 'Cliente criado',
  client_updated: 'Cliente atualizado',
  client_deleted: 'Cliente deletado',
  delete_client: 'Cliente deletado',
  client_paused: 'Cliente pausado',
  client_activated: 'Cliente ativado',
  whatsapp_connected: 'WhatsApp conectado',
  whatsapp_reconnected: 'WhatsApp reconectado',
  google_connected: 'Google conectado',
  config_updated: 'Config atualizada',
  instance_created: 'Instância criada',
  reset_history: 'Histórico resetado',
  history_reset: 'Histórico resetado',
  bot_config_saved: 'Config do bot salva',
}

const SERVICE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  google_calendar: 'Google Calendar',
  chatwoot: 'Chatwoot',
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Todos' },
]

// --- Sub-componentes ---

function PeriodFilter({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden">
      {PERIOD_OPTIONS.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === v
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:bg-secondary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ClientSelect({
  clients,
  value,
  onChange,
}: {
  clients: PanelClientWithRelations[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">Todos os clientes</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'error' }) {
  const cfg = {
    ok: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status]}`}>
      {status}
    </span>
  )
}

function ActionBadge({ action }: { action: string }) {
  const isCritical = ['delete', 'reset', 'remove'].some((k) => action.toLowerCase().includes(k))
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      isCritical ? 'bg-red-100 text-red-700' : 'bg-secondary text-muted-foreground'
    }`}>
      {ACTION_LABELS[action] ?? action.replace(/_/g, ' ')}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// --- Alerts Card ---

function AlertsCard({
  criticalLogs,
  errorHealthChecks,
  clientMap,
}: {
  criticalLogs: PanelAuditLog[]
  errorHealthChecks: PanelHealthCheck[]
  clientMap: Record<string, string>
}) {
  if (criticalLogs.length === 0 && errorHealthChecks.length === 0) return null
  return (
    <div className="rounded-lg border border-red-200 bg-red-50">
      <div className="flex items-center gap-2 border-b border-red-200 px-4 py-3">
        <XCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm font-semibold text-red-800">Alertas recentes</span>
      </div>
      <div className="divide-y divide-red-100">
        {criticalLogs.map((log) => (
          <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <span className="text-sm font-medium text-red-800">
                {ACTION_LABELS[log.action] ?? log.action}
              </span>
              {log.client_id && clientMap[log.client_id] && (
                <span className="ml-2 text-xs text-red-600">— {clientMap[log.client_id]}</span>
              )}
              <p className="text-xs text-red-500">{log.admin_email} · {fmtDate(log.created_at)}</p>
            </div>
            {log.client_id && (
              <Link href={`/clients/${log.client_id}`} className="text-xs text-red-700 hover:underline">
                Ver →
              </Link>
            )}
          </div>
        ))}
        {errorHealthChecks.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <span className="text-sm font-medium text-red-800">
                {SERVICE_LABELS[h.service] ?? h.service} — Erro
              </span>
              {clientMap[h.client_id] && (
                <span className="ml-2 text-xs text-red-600">— {clientMap[h.client_id]}</span>
              )}
              {h.details && <p className="text-xs text-red-500 truncate max-w-sm">{h.details}</p>}
            </div>
            <Link href={`/clients/${h.client_id}`} className="text-xs text-red-700 hover:underline">
              Ver →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Audit Table ---

function AuditTable({
  logs,
  clientMap,
  onDetails,
}: {
  logs: PanelAuditLog[]
  clientMap: Record<string, string>
  onDetails: (d: string) => void
}) {
  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum log encontrado.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Data/Hora</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Admin</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Ação</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Cliente</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
              <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                {fmtDate(log.created_at)}
              </td>
              <td className="px-4 py-2.5 text-xs text-foreground max-w-[160px] truncate">
                {log.admin_email}
              </td>
              <td className="px-4 py-2.5">
                <ActionBadge action={log.action} />
              </td>
              <td className="px-4 py-2.5 text-xs">
                {log.client_id && clientMap[log.client_id] ? (
                  <Link
                    href={`/clients/${log.client_id}`}
                    className="text-primary hover:underline"
                  >
                    {clientMap[log.client_id]}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {log.details && (
                  <button
                    onClick={() => onDetails(JSON.stringify(log.details, null, 2))}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ver detalhes
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Health Table ---

function HealthTable({
  checks,
  clientMap,
  onDetails,
}: {
  checks: PanelHealthCheck[]
  clientMap: Record<string, string>
  onDetails: (d: string) => void
}) {
  if (checks.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum health check encontrado.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Data/Hora</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Serviço</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Cliente</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Resp. (ms)</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {checks.map((h) => (
            <tr key={h.id} className="hover:bg-secondary/20 transition-colors">
              <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                {fmtDate(h.checked_at)}
              </td>
              <td className="px-4 py-2.5 text-xs font-medium text-foreground">
                {SERVICE_LABELS[h.service] ?? h.service}
              </td>
              <td className="px-4 py-2.5 text-xs">
                {clientMap[h.client_id] ? (
                  <Link href={`/clients/${h.client_id}`} className="text-primary hover:underline">
                    {clientMap[h.client_id]}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={h.status as 'ok' | 'warning' | 'error'} />
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {h.response_time_ms != null ? h.response_time_ms : '—'}
              </td>
              <td className="px-4 py-2.5">
                {h.details && (
                  <button
                    onClick={() => onDetails(h.details!)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ver detalhes
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- CSV export ---

function exportLogsCSV(logs: PanelAuditLog[], clientMap: Record<string, string>) {
  const rows = [
    ['Data/Hora', 'Admin', 'Ação', 'Cliente', 'Detalhes'],
    ...logs.map((l) => [
      fmtDate(l.created_at),
      l.admin_email,
      ACTION_LABELS[l.action] ?? l.action,
      l.client_id ? (clientMap[l.client_id] ?? l.client_id) : '',
      JSON.stringify(l.details ?? ''),
    ]),
  ]
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Main Component ---

export function SOCContent({
  initialLogs,
  initialHealthChecks,
  clients,
  clientMap,
  criticalLogs,
  errorHealthChecks,
  activityData,
}: SOCContentProps) {
  // Audit state
  const [logs, setLogs] = useState(initialLogs)
  const [logsTotal, setLogsTotal] = useState<number | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPeriod, setLogsPeriod] = useState<Period>('30d')
  const [logsClientId, setLogsClientId] = useState('')
  const [logsAction, setLogsAction] = useState('')
  const [logsOffset, setLogsOffset] = useState(50)
  const [logsHasMore, setLogsHasMore] = useState(initialLogs.length === 50)

  // Health state
  const [checks, setChecks] = useState(initialHealthChecks)
  const [checksTotal, setChecksTotal] = useState<number | null>(null)
  const [checksLoading, setChecksLoading] = useState(false)
  const [checksPeriod, setChecksPeriod] = useState<Period>('30d')
  const [checksClientId, setChecksClientId] = useState('')
  const [checksStatus, setChecksStatus] = useState('')
  const [checksOffset, setChecksOffset] = useState(50)
  const [checksHasMore, setChecksHasMore] = useState(initialHealthChecks.length === 50)

  // Modal
  const [modalContent, setModalContent] = useState<string | null>(null)

  // Refs para ignorar o efeito no mount inicial
  const logsMounted = useRef(false)
  const checksMounted = useRef(false)

  // Fetch logs quando filtros mudam
  useEffect(() => {
    if (!logsMounted.current) { logsMounted.current = true; return }
    setLogsLoading(true)
    const p = new URLSearchParams({ period: logsPeriod, client_id: logsClientId, action: logsAction, offset: '0', limit: '50' })
    fetch(`/api/soc/logs?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? [])
        setLogsTotal(d.total)
        setLogsOffset(50)
        setLogsHasMore((d.logs ?? []).length === 50)
      })
      .finally(() => setLogsLoading(false))
  }, [logsPeriod, logsClientId, logsAction])

  // Fetch health checks quando filtros mudam
  useEffect(() => {
    if (!checksMounted.current) { checksMounted.current = true; return }
    setChecksLoading(true)
    const p = new URLSearchParams({ period: checksPeriod, client_id: checksClientId, status: checksStatus, offset: '0', limit: '50' })
    fetch(`/api/soc/health?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setChecks(d.checks ?? [])
        setChecksTotal(d.total)
        setChecksOffset(50)
        setChecksHasMore((d.checks ?? []).length === 50)
      })
      .finally(() => setChecksLoading(false))
  }, [checksPeriod, checksClientId, checksStatus])

  async function loadMoreLogs() {
    setLogsLoading(true)
    const p = new URLSearchParams({ period: logsPeriod, client_id: logsClientId, action: logsAction, offset: String(logsOffset), limit: '50' })
    const d = await fetch(`/api/soc/logs?${p}`).then((r) => r.json())
    setLogs((prev) => [...prev, ...(d.logs ?? [])])
    setLogsOffset((o) => o + 50)
    setLogsHasMore((d.logs ?? []).length === 50)
    setLogsLoading(false)
  }

  async function loadMoreChecks() {
    setChecksLoading(true)
    const p = new URLSearchParams({ period: checksPeriod, client_id: checksClientId, status: checksStatus, offset: String(checksOffset), limit: '50' })
    const d = await fetch(`/api/soc/health?${p}`).then((r) => r.json())
    setChecks((prev) => [...prev, ...(d.checks ?? [])])
    setChecksOffset((o) => o + 50)
    setChecksHasMore((d.checks ?? []).length === 50)
    setChecksLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Centro de Operações
        </h1>
        <span className="text-sm text-muted-foreground border-l border-border pl-3">SOC</span>
      </div>

      {/* Alertas críticos */}
      <AlertsCard
        criticalLogs={criticalLogs}
        errorHealthChecks={errorHealthChecks}
        clientMap={clientMap}
      />

      {/* Gráfico de atividade */}
      <div className="glass-card">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Atividade — últimos 7 dias</h2>
        </div>
        <div className="px-5 py-4">
          <ActivityChart data={activityData} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="audit">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="audit">Logs de Auditoria</TabsTrigger>
            <TabsTrigger value="health">Health Checks</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab: Audit ─────────────────────────────────── */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter value={logsPeriod} onChange={setLogsPeriod} />
            <ClientSelect clients={clients} value={logsClientId} onChange={setLogsClientId} />
            <input
              type="text"
              placeholder="Filtrar por ação..."
              value={logsAction}
              onChange={(e) => setLogsAction(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="ml-auto flex items-center gap-2">
              {logsTotal != null && (
                <span className="text-xs text-muted-foreground">{logs.length} de {logsTotal}</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLogsCSV(logs, clientMap)}
                className="h-7 gap-1.5 text-xs"
              >
                <Download className="h-3 w-3" />
                Exportar CSV
              </Button>
            </div>
          </div>

          {/* Tabela */}
          {logsLoading && logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <AuditTable logs={logs} clientMap={clientMap} onDetails={setModalContent} />
          )}

          {/* Load more */}
          {logsHasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMoreLogs}
                disabled={logsLoading}
                className="gap-1.5 text-xs"
              >
                <ChevronDown className="h-3 w-3" />
                {logsLoading ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Health ─────────────────────────────────── */}
        <TabsContent value="health" className="mt-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter value={checksPeriod} onChange={setChecksPeriod} />
            <ClientSelect clients={clients} value={checksClientId} onChange={setChecksClientId} />
            {/* Status filter */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {[
                { value: '', label: 'Todos' },
                { value: 'ok', label: 'OK' },
                { value: 'warning', label: 'Warning' },
                { value: 'error', label: 'Error' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setChecksStatus(value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    checksStatus === value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {checksTotal != null && (
              <span className="ml-auto text-xs text-muted-foreground">
                {checks.length} de {checksTotal}
              </span>
            )}
          </div>

          {/* Tabela */}
          {checksLoading && checks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <HealthTable checks={checks} clientMap={clientMap} onDetails={setModalContent} />
          )}

          {/* Load more */}
          {checksHasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMoreChecks}
                disabled={checksLoading}
                className="gap-1.5 text-xs"
              >
                <ChevronDown className="h-3 w-3" />
                {checksLoading ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de detalhes */}
      <Dialog open={!!modalContent} onOpenChange={() => setModalContent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes</DialogTitle>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto rounded-md bg-secondary p-4 text-xs text-foreground">
            {modalContent}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
