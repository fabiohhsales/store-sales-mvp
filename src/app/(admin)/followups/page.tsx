import { listClients } from '@/lib/db/clients'
import { FollowupsPageClient } from './followups-client'

export default async function FollowupsPage() {
  const clients = await listClients()
  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')
  const initial = active[0]?.id ?? ''

  return (
    <FollowupsPageClient
      clients={active.map((c) => ({ id: c.id, name: c.name }))}
      initialClientId={initial}
    />
  )
}
