import type { PanelAuditLog } from '@/types/database'

interface RecentActivityProps {
  logs: PanelAuditLog[]
}

const actionLabels: Record<string, string> = {
  client_created: 'Cliente criado',
  client_updated: 'Cliente atualizado',
  client_paused: 'Cliente pausado',
  client_activated: 'Cliente ativado',
  client_deleted: 'Cliente removido',
  whatsapp_connected: 'WhatsApp conectado',
  whatsapp_reconnected: 'WhatsApp reconectado',
  whatsapp_disconnected: 'WhatsApp desconectado',
  whatsapp_instance_created: 'Instância criada',
  google_connected: 'Google conectado',
  google_calendar_connected: 'Google Calendar conectado',
  google_refreshed: 'Google renovado',
  config_updated: 'Configuração atualizada',
  bot_config_saved: 'Bot configurado',
  instance_created: 'Instância criada',
  instance_deleted: 'Instância removida',
}

export function RecentActivity({ logs }: RecentActivityProps) {
  return (
    <div className="glass-card opacity-0 animate-fade-in" style={{ animationDelay: '300ms' }}>
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Atividade Recente</h2>
      </div>
      {logs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-[480px] overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-secondary/30 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {actionLabels[log.action] || log.action}
                </p>
                <p className="text-xs text-muted-foreground truncate">{log.admin_email}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                {new Date(log.created_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
