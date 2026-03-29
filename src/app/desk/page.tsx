export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { DeskShell } from '@/components/desk/desk-shell'

export default async function DeskPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { client_id: queryClientId } = await searchParams

  // Resolve client_id: tenta panel_users primeiro, depois query param
  let clientId = queryClientId ?? ''
  let clientName = ''

  const { data: panelUser } = await admin
    .from('panel_users')
    .select('role, client_id')
    .eq('id', user.id)
    .maybeSingle()

  if (panelUser?.role === 'operator' && panelUser.client_id) {
    clientId = panelUser.client_id
  }

  if (clientId) {
    const { data: client } = await admin
      .from('panel_clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle()
    clientName = client?.name ?? ''
  }

  // Admin sem client_id: mostra seletor de cliente
  if (!clientId) {
    const { data: clients } = await admin
      .from('panel_clients')
      .select('id, name')
      .eq('status', 'active')
      .order('name')

    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="glass-card w-full max-w-sm p-8 space-y-4">
          <h1 className="text-xl font-bold text-foreground">Painel de Atendimento</h1>
          <p className="text-sm text-muted-foreground">Selecione o cliente para atender:</p>
          <div className="space-y-2">
            {(clients ?? []).map((c) => (
              <a
                key={c.id}
                href={`/desk?client_id=${c.id}`}
                className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-sm font-medium"
              >
                {c.name}
              </a>
            ))}
            {(clients ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum cliente ativo.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <DeskShell
      clientId={clientId}
      clientName={clientName}
      userEmail={user.email ?? ''}
    />
  )
}
