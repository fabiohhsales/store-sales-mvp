'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { HealthIndicator } from './health-indicator'
import { getChatwootPublicUrl } from '@/lib/config'
import type { PanelClientWithRelations, ClientStatus } from '@/types/database'

interface ClientListProps {
  clients: PanelClientWithRelations[]
}

const statusLabels: Record<ClientStatus, string> = {
  draft: 'Rascunho',
  pending_whatsapp: 'Pendente WhatsApp',
  pending_google: 'Pendente Google',
  configuring: 'Configurando',
  active: 'Ativo',
  paused: 'Pausado',
  disconnected: 'Desconectado',
}

const statusStyles: Record<ClientStatus, string> = {
  draft: 'bg-muted-foreground/15 text-muted-foreground',
  pending_whatsapp: 'bg-warning/15 text-warning',
  pending_google: 'bg-warning/15 text-warning',
  configuring: 'bg-info/15 text-info',
  active: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
  disconnected: 'bg-destructive/15 text-destructive',
}

function ConnectionDot({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`connection-dot ${connected ? 'online' : 'offline'}`}
      />
      <span className="text-sm text-muted-foreground">
        {label ?? (connected ? 'Conectado' : 'Desconectado')}
      </span>
    </div>
  )
}

export function ClientList({ clients }: ClientListProps) {
  const chatwootUrl = getChatwootPublicUrl()

  if (clients.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-muted-foreground">Nenhum cliente cadastrado.</p>
        <Link
          href="/clients/new"
          className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Cadastrar primeiro cliente
        </Link>
      </div>
    )
  }

  return (
    <div className="glass-card overflow-hidden opacity-0 animate-fade-in" style={{ animationDelay: '200ms' }}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Lista de Clientes</h2>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors">
            Exportar
          </button>
          <button className="px-3 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors">
            Filtrar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Cliente</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Responsável</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">WhatsApp</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Google</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Criado em</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <td className="px-5 py-3.5">
                  <Link href={`/clients/${client.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                    {client.name}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.owner_name}</td>
                <td className="px-5 py-3.5">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[client.status]}`}>
                    {statusLabels[client.status]}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <HealthIndicator
                    instanceName={client.panel_whatsapp_config?.evolution_instance_name}
                    initialStatus={client.panel_whatsapp_config?.connection_status}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <ConnectionDot
                    connected={!!client.panel_google_config?.google_email}
                    label={client.panel_google_config?.google_email ? 'Conectado' : 'Pendente'}
                  />
                </td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground tabular-nums">
                  {new Date(client.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/clients/${client.id}`}
                      className="px-2.5 py-1 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                    >
                      Ver
                    </Link>
                    {chatwootUrl && client.chatwoot_account_id && (
                      <a
                        href={`${chatwootUrl}/accounts/${client.chatwoot_account_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors inline-flex items-center gap-1"
                      >
                        Chatwoot
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
