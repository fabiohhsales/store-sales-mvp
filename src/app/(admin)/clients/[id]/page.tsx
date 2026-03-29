import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { getClientById } from '@/lib/db/clients'
import { listAuditLogsByClientId } from '@/lib/db/audit-log'
import { StatusCards } from '@/components/client-detail/status-cards'
import { ClientActions } from '@/components/client-detail/client-actions'
import { GoogleReconnect } from '@/components/client-detail/google-reconnect'
import { WhatsAppConnectionPanel } from '@/components/client-detail/whatsapp-connection-panel'
import { ClientAuditLog } from '@/components/client-detail/client-audit-log'
import { ClientMetrics } from '@/components/client-detail/client-metrics'
import { ChatwootAppsSetup } from '@/components/client-detail/chatwoot-apps-setup'
import { ChatwootDiagnostic } from '@/components/client-detail/chatwoot-diagnostic'
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

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let client
  try {
    client = await getClientById(id)
  } catch {
    notFound()
  }

  const logs = await listAuditLogsByClientId(id, 20)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
            <p className="text-muted-foreground">
              {client.owner_name} — {client.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
              {statusLabels[client.status]}
            </Badge>
            <ClientActions client={client} />
          </div>
        </div>
      </div>

      <StatusCards client={client} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <WhatsAppConnectionPanel
            clientId={id}
            initialInstanceName={client.panel_whatsapp_config?.evolution_instance_name}
            clientName={client.name}
          />

          {/* Google Calendar — sempre visível */}
          <GoogleReconnect
            clientId={id}
            currentEmail={client.panel_google_config?.google_email}
          />

          <Suspense fallback={<Skeleton className="h-32" />}>
            <ClientMetrics
              clientId={id}
              instanceName={client.panel_whatsapp_config?.evolution_instance_name}
            />
          </Suspense>

          {/* Agenda — link rápido para agendamentos do cliente */}
          <Link
            href={`/clients/${id}/appointments`}
            className="glass-card flex items-center gap-4 p-5 hover:bg-secondary/50 transition-colors group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
              <CalendarDays size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Agenda</p>
              <p className="text-xs text-muted-foreground">Ver agendamentos e compromissos</p>
            </div>
          </Link>

          <ChatwootAppsSetup
            clientId={id}
            hasChatwoot={!!(client.chatwoot_account_id ?? client.panel_whatsapp_config?.chatwoot_account_id)}
          />

          <ChatwootDiagnostic
            clientId={id}
            accountId={client.chatwoot_account_id ?? client.panel_whatsapp_config?.chatwoot_account_id ?? null}
            hasToken={!!(client.chatwoot_agent_token ?? client.panel_whatsapp_config?.chatwoot_agent_token)}
          />
        </div>

        <div>
          <ClientAuditLog logs={logs} />
        </div>
      </div>
    </div>
  )
}
