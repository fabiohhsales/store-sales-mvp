export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { DeskShell } from '@/components/desk/desk-shell'
import { getPanelSession } from '@/lib/auth/panel-session'

export default async function DeskPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; conversation_id?: string }>
}) {
  const session = await getPanelSession()
  if (!session) redirect('/login')

  const admin = createAdminClient()
  const { client_id: queryClientId, conversation_id: queryConversationId } = await searchParams

  let clientId = queryClientId ?? ''
  let clientName = ''

  if (session.role === 'operator' && session.clientId) {
    clientId = session.clientId
  }

  if (clientId) {
    const { data: client } = await admin
      .from('panel_clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle()
    clientName = client?.name ?? ''
  }

  if (!clientId) {
    const { data: clients } = await admin
      .from('panel_clients')
      .select('id, name')
      .eq('status', 'active')
      .order('name')

    return (
      <div className="flex h-full w-full items-center justify-center p-6">
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
      userEmail={session.user.email ?? ''}
      userId={session.user.id}
      initialConversationId={queryConversationId ?? null}
    />
  )
}
