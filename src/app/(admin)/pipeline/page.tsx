import { listClients } from '@/lib/db/clients'
import { PipelinePageClient } from './pipeline-client'

export default async function PipelinePage() {
  const clients = await listClients()
  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')
  const initial = active[0]?.id ?? ''

  return <PipelinePageClient clients={active.map((c) => ({ id: c.id, name: c.name }))} initialClientId={initial} />
}
