import { listClients } from '@/lib/db/clients'
import { AgendaPageClient } from './agenda-client'

export default async function AgendaPage() {
  const clients = await listClients()
  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')
  const initial = active[0]?.id ?? ''

  return <AgendaPageClient clients={active.map((c) => ({ id: c.id, name: c.name }))} initialClientId={initial} />
}
