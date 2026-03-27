import { StatsCards } from '@/components/dashboard/stats-cards'
import { ClientList } from '@/components/dashboard/client-list'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { SOCPanel } from '@/components/dashboard/soc-panel'
import { listClients } from '@/lib/db/clients'
import { listRecentAuditLogs } from '@/lib/db/audit-log'

export default async function DashboardPage() {
  const [clients, recentLogs] = await Promise.all([
    listClients(),
    listRecentAuditLogs(10),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>

      <SOCPanel />

      <StatsCards clients={clients} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ClientList clients={clients} />
        </div>
        <div>
          <RecentActivity logs={recentLogs} />
        </div>
      </div>
    </div>
  )
}
