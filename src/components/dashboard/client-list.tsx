import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { HealthIndicator } from './health-indicator'
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

const statusVariants: Record<ClientStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  pending_whatsapp: 'secondary',
  pending_google: 'secondary',
  configuring: 'secondary',
  active: 'default',
  paused: 'outline',
  disconnected: 'destructive',
}

export function ClientList({ clients }: ClientListProps) {
  if (clients.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
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
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead>Google</TableHead>
            <TableHead className="text-right">Criado em</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <Link
                  href={`/clients/${client.id}`}
                  className="font-medium hover:underline"
                >
                  {client.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {client.owner_name}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariants[client.status]}>
                  {statusLabels[client.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <HealthIndicator
                  instanceName={client.panel_whatsapp_config?.evolution_instance_name}
                  initialStatus={client.panel_whatsapp_config?.connection_status}
                />
              </TableCell>
              <TableCell>
                {client.panel_google_config?.google_email ? (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-xs text-muted-foreground">Conectado</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-xs text-muted-foreground">Pendente</span>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {new Date(client.created_at).toLocaleDateString('pt-BR')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
