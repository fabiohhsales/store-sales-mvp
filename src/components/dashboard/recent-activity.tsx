import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { PanelAuditLog } from '@/types/database'

interface RecentActivityProps {
  logs: PanelAuditLog[]
}

const actionLabels: Record<string, string> = {
  client_created: 'Cliente criado',
  client_updated: 'Cliente atualizado',
  client_paused: 'Cliente pausado',
  client_activated: 'Cliente ativado',
  whatsapp_connected: 'WhatsApp conectado',
  whatsapp_reconnected: 'WhatsApp reconectado',
  whatsapp_disconnected: 'WhatsApp desconectado',
  google_connected: 'Google conectado',
  google_refreshed: 'Google renovado',
  config_updated: 'Configuração atualizada',
  instance_created: 'Instância criada',
  instance_deleted: 'Instância removida',
}

export function RecentActivity({ logs }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atividade Recente</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">
                    {actionLabels[log.action] || log.action}
                  </p>
                  <p className="text-xs text-muted-foreground">{log.admin_email}</p>
                </div>
                <time className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
