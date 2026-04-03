import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { OperatorDashboard } from '@/components/account/operator-dashboard'
import { listClientsAdmin } from '@/lib/db/clients'
import { getPanelSession } from '@/lib/auth/panel-session'
import type { ClientStatus } from '@/types/database'

const statusLabels: Record<ClientStatus, string> = {
  draft: 'Rascunho',
  pending_whatsapp: 'Pendente WhatsApp',
  pending_google: 'Pendente Google',
  configuring: 'Configurando',
  active: 'Ativo',
  paused: 'Pausado',
  disconnected: 'Desconectado',
}

export default async function AccountPage() {
  const session = await getPanelSession()
  if (!session) redirect('/login')

  let clients = await listClientsAdmin()

  if (session.role === 'operator' && session.clientId) {
    clients = clients.filter((c) => c.id === session.clientId)
  }

  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')

  if (active.length === 0) {
    redirect(session.role === 'operator' ? '/desk' : '/clients')
  }

  if (active.length === 1 && session.role === 'operator') {
    return (
      <div className="p-4 lg:p-6">
        <OperatorDashboard clientId={active[0].id} clientName={active[0].name} />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Minha Conta</h1>
        <div className="text-right space-y-0.5">
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{session.role}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((client) => (
          <a
            key={client.id}
            href={`/clients/${client.id}`}
            className="rounded-lg border bg-card p-5 hover:border-primary/50 transition-colors block"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{client.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{client.owner_name}</p>
              </div>
              <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="shrink-0">
                {statusLabels[client.status]}
              </Badge>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
