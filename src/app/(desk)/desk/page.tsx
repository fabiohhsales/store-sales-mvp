export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { DeskShell } from '@/components/desk/desk-shell'
import { getStoreSession } from '@/lib/auth/store-session'

export default async function DeskPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; account_id?: string; conversation_id?: string }>
}) {
  const session = await getStoreSession()
  if (!session) redirect('/login')

  const admin = createAdminClient()
  const params = await searchParams
  const queryAccountId = params.account_id ?? params.client_id
  const queryConversationId = params.conversation_id

  let accountId = queryAccountId ?? ''
  let accountName = ''

  if (session.role !== 'system_admin' && session.accountId) {
    accountId = session.accountId
  }

  if (accountId) {
    const { data: account } = await admin
      .from('store_accounts')
      .select('name')
      .eq('id', accountId)
      .maybeSingle()
    accountName = account?.name ?? ''
  }

  if (!accountId) {
    const { data: accounts } = await admin
      .from('store_accounts')
      .select('id, name')
      .eq('status', 'active')
      .order('name')

    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="glass-card w-full max-w-sm p-8 space-y-4">
          <h1 className="text-xl font-bold text-foreground">Painel de Atendimento</h1>
          <p className="text-sm text-muted-foreground">Selecione a conta para atender:</p>
          <div className="space-y-2">
            {(accounts ?? []).map((c) => (
              <a
                key={c.id}
                href={`/desk?account_id=${c.id}`}
                className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-sm font-medium"
              >
                {c.name}
              </a>
            ))}
            {(accounts ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conta ativa.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <DeskShell
      clientId={accountId}
      clientName={accountName}
      userEmail={session.user.email ?? ''}
      userId={session.user.id}
      initialConversationId={queryConversationId ?? null}
    />
  )
}
