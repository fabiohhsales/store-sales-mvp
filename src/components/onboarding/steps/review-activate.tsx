'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Check, AlertCircle, ArrowLeft, Rocket } from 'lucide-react'
import type { PanelClientWithRelations } from '@/types/database'

interface ReviewActivateStepProps {
  clientId: string
  onActivated: () => void
  onBack: () => void
}

export function ReviewActivateStep({ clientId, onActivated, onBack }: ReviewActivateStepProps) {
  const [client, setClient] = useState<PanelClientWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}`)
        if (!res.ok) throw new Error()
        setClient(await res.json())
      } catch {
        toast.error('Erro ao carregar dados do cliente')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clientId])

  const handleActivate = async () => {
    setActivating(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/activate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao ativar')
      }
      toast.success('Cliente ativado com sucesso!')
      onActivated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao ativar')
    } finally {
      setActivating(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    )
  }

  if (!client) return null

  const hasWhatsApp = !!client.panel_whatsapp_config
  const hasGoogle = !!client.panel_google_config?.google_email
  const hasBotConfig = !!client.panel_bot_config
  const whatsAppConnected = client.panel_whatsapp_config?.connection_status === 'open'

  const checks = [
    { label: 'Dados do negócio', ok: true },
    { label: 'Instância WhatsApp criada', ok: hasWhatsApp },
    { label: 'WhatsApp conectado', ok: whatsAppConnected, warn: hasWhatsApp && !whatsAppConnected },
    { label: 'Google Calendar conectado', ok: hasGoogle },
    { label: 'Bot configurado', ok: hasBotConfig },
  ]

  const canActivate = hasWhatsApp && hasBotConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Revisão e Ativação
        </CardTitle>
        <CardDescription>
          Revise as configurações antes de ativar o cliente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-1 text-lg font-medium">{client.name}</h3>
          <p className="text-sm text-muted-foreground">{client.owner_name} — {client.email}</p>
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Checklist</h4>
          {checks.map((check) => (
            <div key={check.label} className="flex items-center gap-3">
              {check.ok ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : check.warn ? (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
              )}
              <span className="text-sm">{check.label}</span>
              {check.ok && <Badge variant="secondary" className="ml-auto text-xs">OK</Badge>}
              {check.warn && <Badge variant="outline" className="ml-auto text-xs">Pendente</Badge>}
            </div>
          ))}
        </div>

        {client.panel_bot_config && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Configuração do Bot</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profissional</span>
                  <span>{client.panel_bot_config.professional_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tom</span>
                  <span>{client.panel_bot_config.ai_tone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviços</span>
                  <span>{client.panel_bot_config.services?.length || 0} configurados</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Follow-up</span>
                  <span>{client.panel_bot_config.followup_enabled ? 'Ativo' : 'Desativado'}</span>
                </div>
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={handleActivate} disabled={!canActivate || activating}>
            {activating ? 'Ativando...' : 'Ativar Cliente'}
          </Button>
        </div>

        {!canActivate && (
          <p className="text-center text-xs text-muted-foreground">
            É necessário ao menos a instância WhatsApp e a configuração do bot para ativar.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
