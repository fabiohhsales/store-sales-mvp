import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { ClientList } from '@/components/dashboard/client-list'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { listClients } from '@/lib/db/clients'
import { listRecentAuditLogs } from '@/lib/db/audit-log'

export default async function DashboardPage() {
  const [clients, recentLogs] = await Promise.all([
    listClients(),
    listRecentAuditLogs(10),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Link href="/clients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </Link>
      </div>

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
