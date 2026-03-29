"use client"

import { useState } from 'react'
import { Smartphone, Calendar, Bot, MessageSquare, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react'
import { HealthIndicator } from '@/components/dashboard/health-indicator'
import { getChatwootPublicUrl } from '@/lib/config'
import { Button } from '@/components/ui/button'
import type { PanelClientWithRelations } from '@/types/database'

interface StatusCardsProps {
  client: PanelClientWithRelations
}

export function StatusCards({ client }: StatusCardsProps) {
  const [copied, setCopied] = useState(false)
  const hasWhatsApp = !!client.panel_whatsapp_config
  const hasGoogle = !!client.panel_google_config?.google_email
  const hasBotConfig = !!client.panel_bot_config
  const hasChatwoot = !!(client.chatwoot_account_id ?? client.panel_whatsapp_config?.chatwoot_account_id)
  const chatwootAccountId = client.chatwoot_account_id ?? client.panel_whatsapp_config?.chatwoot_account_id
  const chatwootLoginEmail = client.chatwoot_email ?? client.panel_whatsapp_config?.chatwoot_email ?? client.email
  const chatwootUrl = getChatwootPublicUrl()

  async function copyLoginEmail() {
    try {
      await navigator.clipboard.writeText(chatwootLoginEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const missing: string[] = []
  if (!hasWhatsApp) missing.push('WhatsApp')
  if (!hasGoogle) missing.push('Google Calendar')
  if (!hasBotConfig) missing.push('Bot')

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm text-warning">
            <span className="font-medium">Configuração incompleta:</span>{' '}
            {missing.join(', ')} {missing.length === 1 ? 'não configurado' : 'não configurados'}.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Chatwoot</span>
            <MessageSquare size={18} className="text-muted-foreground" />
          </div>
          {hasChatwoot ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="connection-dot online" />
                <span className="text-sm font-medium text-foreground">Provisionado</span>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground truncate" title={chatwootLoginEmail}>
                  Login: {chatwootLoginEmail}
                </p>
                <Button type="button" size="icon" variant="ghost" className="h-5 w-5" onClick={copyLoginEmail} title="Copiar login">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </Button>
              </div>
              {chatwootUrl && (
                <div className="flex flex-col gap-1">
                  {chatwootAccountId && (
                    <a
                      href={`${chatwootUrl}/accounts/${chatwootAccountId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Abrir conta
                      <ExternalLink size={10} />
                    </a>
                  )}
                  <a
                    href={`${chatwootUrl}/app/auth/password/reset`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Redefinir senha
                    <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted-foreground/15 text-muted-foreground">
              Pendente
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
