import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { PanelAuditLog } from '@/types/database'

interface ClientAuditLogProps {
  logs: PanelAuditLog[]
}

const actionLabels: Record<string, string> = {
  client_created: 'Cliente criado',
  client_updated: 'Cliente atualizado',
  client_paused: 'Cliente pausado',
  client_activated: 'Cliente ativado',
  whatsapp_connected: 'WhatsApp conectado',
  whatsapp_reconnected: 'WhatsApp reconectado',
  google_connected: 'Google conectado',
  config_updated: 'Configuração atualizada',
  instance_created: 'Instância criada',
}

export function ClientAuditLog({ logs }: ClientAuditLogProps) {
  if (logs.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de Ações</CardTitle>
      </CardHeader>
      <CardContent>
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
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
