import { createClient } from '@/lib/supabase/server'
import { listClients } from '@/lib/db/clients'
import { SOCContent } from '@/components/soc/soc-content'
import type { PanelAuditLog, PanelHealthCheck } from '@/types/database'

export const metadata = { robots: 'noindex' }

// Ações críticas que geram alertas no topo
const CRITICAL_ACTIONS = ['delete', 'reset', 'remove', 'apag']

function buildActivityData(logs: PanelAuditLog[]) {
  const counts: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    counts[d.toISOString().split('T')[0]] = 0
  }
  for (const log of logs) {
    const day = log.created_at.split('T')[0]
    if (day in counts) counts[day]++
  }
  return Object.entries(counts).map(([iso, count]) => ({
    date: new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    count,
  }))
}

export default async function SOCPage() {
  const supabase = await createClient()

  // Server Component — Date.now() é seguro aqui (executa uma vez por request)
  const now = Date.now() // eslint-disable-line react-hooks/purity
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: logs },
    { data: logs7d },
    { data: healthChecks },
    clients,
  ] = await Promise.all([
    supabase
      .from('panel_audit_log')
      .select('*')
      .gte('created_at', since30d)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('panel_audit_log')
      .select('*')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false }),
    supabase
      .from('panel_health_checks')
      .select('*')
      .gte('checked_at', since30d)
      .order('checked_at', { ascending: false })
      .limit(50),
    listClients(),
  ])

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.name]))

  const criticalLogs = (logs ?? [])
    .filter((l) => CRITICAL_ACTIONS.some((a) => l.action.toLowerCase().includes(a)))
    .slice(0, 5)

  const errorHealthChecks = (healthChecks ?? [])
    .filter((h) => h.status === 'error')
    .slice(0, 5)

  return (
    <SOCContent
      initialLogs={(logs ?? []) as PanelAuditLog[]}
      initialHealthChecks={(healthChecks ?? []) as PanelHealthCheck[]}
      clients={clients}
      clientMap={clientMap}
      criticalLogs={(criticalLogs ?? []) as PanelAuditLog[]}
      errorHealthChecks={(errorHealthChecks ?? []) as PanelHealthCheck[]}
      activityData={buildActivityData((logs7d ?? []) as PanelAuditLog[])}
    />
  )
}
