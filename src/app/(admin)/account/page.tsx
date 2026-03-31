import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { listClients } from '@/lib/db/clients'
import { OperatorDashboard } from '@/components/account/operator-dashboard'
import type { ClientStatus } from '@/types/database'
import { createClient } from '@/lib/supabase/server'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let clients = await listClients()
  let isOperator = false

  if (user) {
    const { data: panelUser } = await supabase
      .from('panel_users')
      .select('role, client_id')
      .eq('id', user.id)
      .maybeSingle()

    if (panelUser?.role === 'operator' && panelUser.client_id) {
      clients = clients.filter(c => c.id === panelUser.client_id)
      isOperator = true
    }
  }

  const active = clients.filter((c) => c.status === 'active' || c.status === 'paused')

  if (active.length === 0) {
    redirect('/clients')
  }

  // Operador com 1 cliente: mostra dashboard do operador
  if (active.length === 1 && isOperator) {
    return <OperatorDashboard clientId={active[0].id} clientName={active[0].name} />
  }

  // Admin com 1 cliente: redireciona para a página de detalhe
  if (active.length === 1) {
    redirect(`/clients/${active[0].id}`)
  }

  // Múltiplos clientes — show a picker
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Minha Conta</h1>
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
