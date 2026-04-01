import { listClients } from '@/lib/db/clients'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AgendaPageClient } from './agenda-client'

export default async function AgendaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let viewerRole: 'admin' | 'operator' = 'admin'
  let operatorClientId: string | null = null

  if (user) {
    const admin = createAdminClient()
    const { data: panelUser } = await admin
      .from('panel_users')
      .select('role, client_id')
      .eq('id', user.id)
      .maybeSingle()

    if (panelUser?.role === 'operator' && panelUser.client_id) {
      viewerRole = 'operator'
      operatorClientId = panelUser.client_id
    }
  }

  const clients = await listClients()
  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')
  const scopedClients =
    viewerRole === 'operator' && operatorClientId
      ? active.filter((c) => c.id === operatorClientId)
      : active
  const initial = viewerRole === 'operator' ? operatorClientId ?? '' : scopedClients[0]?.id ?? ''

  return (
    <AgendaPageClient
      clients={scopedClients.map((c) => ({ id: c.id, name: c.name }))}
      initialClientId={initial}
      viewerRole={viewerRole}
    />
  )
}
