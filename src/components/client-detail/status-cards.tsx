import { Smartphone, Calendar, Bot } from 'lucide-react'
import { HealthIndicator } from '@/components/dashboard/health-indicator'
import type { PanelClientWithRelations } from '@/types/database'

interface StatusCardsProps {
  client: PanelClientWithRelations
}

export function StatusCards({ client }: StatusCardsProps) {
  const hasGoogle = !!client.panel_google_config?.google_email
  const hasBotConfig = !!client.panel_bot_config

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">WhatsApp</span>
          <Smartphone size={18} className="text-muted-foreground" />
        </div>
        {client.panel_whatsapp_config ? (
          <div className="space-y-1">
            <HealthIndicator
              instanceName={client.panel_whatsapp_config.evolution_instance_name}
              initialStatus={client.panel_whatsapp_config.connection_status}
            />
            <p className="text-xs text-muted-foreground">
              {client.panel_whatsapp_config.connected_phone || client.panel_whatsapp_config.evolution_instance_name}
            </p>
          </div>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted-foreground/15 text-muted-foreground">
            Não configurado
          </span>
        )}
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">Google Calendar</span>
          <Calendar size={18} className="text-muted-foreground" />
        </div>
        {hasGoogle ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="connection-dot online" />
              <span className="text-sm font-medium text-foreground">Conectado</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {client.panel_google_config!.google_email}
            </p>
          </div>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted-foreground/15 text-muted-foreground">
            Não conectado
          </span>
        )}
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">Bot</span>
          <Bot size={18} className="text-muted-foreground" />
        </div>
        {hasBotConfig ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="connection-dot online" />
              <span className="text-sm font-medium text-foreground">Configurado</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {client.panel_bot_config!.professional_name}
            </p>
          </div>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted-foreground/15 text-muted-foreground">
            Não configurado
          </span>
        )}
      </div>
    </div>
  )
}
