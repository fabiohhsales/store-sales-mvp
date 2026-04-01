import { redirect } from 'next/navigation'
import { PipelinePageClient } from '@/app/(admin)/pipeline/pipeline-client'
import { listClients } from '@/lib/db/clients'
import { getPanelSession } from '@/lib/auth/panel-session'

export default async function PipelinePage() {
  const session = await getPanelSession()
  if (!session) redirect('/login')

  const clients = await listClients()
  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')
  const scopedClients =
    session.role === 'operator' && session.clientId
      ? active.filter((c) => c.id === session.clientId)
      : active
  const initial = session.role === 'operator' ? session.clientId ?? '' : scopedClients[0]?.id ?? ''

  return (
    <div className="p-4 lg:p-6">
      <PipelinePageClient
        clients={scopedClients.map((c) => ({ id: c.id, name: c.name }))}
        initialClientId={initial}
        viewerRole={session.role}
      />
    </div>
  )
}
