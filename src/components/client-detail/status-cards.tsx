import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">WhatsApp</CardTitle>
          <Smartphone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
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
            <Badge variant="outline">Não configurado</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Google Calendar</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {hasGoogle ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Conectado</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {client.panel_google_config!.google_email}
              </p>
            </div>
          ) : (
            <Badge variant="outline">Não conectado</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Bot</CardTitle>
          <Bot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {hasBotConfig ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Configurado</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {client.panel_bot_config!.professional_name}
              </p>
            </div>
          ) : (
            <Badge variant="outline">Não configurado</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
