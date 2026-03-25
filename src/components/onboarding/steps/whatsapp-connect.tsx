'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Smartphone, Check, RefreshCw, Copy, ExternalLink } from 'lucide-react'

interface WhatsAppConnectStepProps {
  clientId: string
  onComplete: (instanceName: string) => void
  onSkip: () => void
}

type ConnectionState = 'idle' | 'creating' | 'waiting_scan' | 'connected' | 'error'

export function WhatsAppConnectStep({ clientId, onComplete, onSkip }: WhatsAppConnectStepProps) {
  const [instanceName, setInstanceName] = useState('')
  const [state, setState] = useState<ConnectionState>('idle')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async (name: string) => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${name}/status`)
      const data = await res.json()
      if (data.state === 'open') {
        setState('connected')
        toast.success('WhatsApp conectado!')
        // Auto-avança após 1.5s pra o usuário ver a confirmação
        setTimeout(() => onComplete(name), 1500)
        return true
      }
    } catch {
      // ignore polling errors
    }
    return false
  }, [onComplete])

  useEffect(() => {
    if (state !== 'waiting_scan' || !instanceName) return

    const interval = setInterval(async () => {
      const connected = await checkStatus(instanceName)
      if (connected) clearInterval(interval)
    }, 3000)

    return () => clearInterval(interval)
  }, [state, instanceName, checkStatus])

  const handleCreate = async () => {
    if (!instanceName.trim()) {
      toast.error('Informe o nome da instância')
      return
    }

    setState('creating')
    setError(null)

    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, instance_name: instanceName.trim() }),
      })

      const text = await res.text()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: Record<string, any>
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Erro interno do servidor (${res.status})`)
      }

      if (!res.ok) {
        throw new Error((data.error as string) || 'Erro ao criar instância')
      }
      if (data.qrcode?.base64) {
        setQrBase64(data.qrcode.base64)
      }
      setState('waiting_scan')
      toast.success('Instância criada! Escaneie o QR Code.')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      toast.error(err instanceof Error ? err.message : 'Erro ao criar instância')
    }
  }

  const handleRefreshQR = async () => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/qrcode`)
      if (!res.ok) throw new Error('Erro ao gerar QR')
      const text = await res.text()
      const data = JSON.parse(text)
      if (data.base64) {
        setQrBase64(data.base64)
        toast.success('QR Code atualizado')
      }
    } catch {
      toast.error('Erro ao atualizar QR Code')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Conectar WhatsApp
        </CardTitle>
        <CardDescription>
          Crie a instância do WhatsApp e escaneie o QR Code para conectar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state === 'idle' || state === 'error' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instance">Nome da instância (slug)</Label>
              <Input
                id="instance"
                placeholder="clinica-dr-silva"
                value={instanceName}
                onChange={(e) =>
                  setInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
              />
              <p className="text-xs text-muted-foreground">
                Identificador único. Use letras minúsculas, números e hífens.
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button onClick={handleCreate} disabled={!instanceName.trim()}>
              Criar Instância
            </Button>
          </div>
        ) : state === 'creating' ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Skeleton className="h-64 w-64" />
            <p className="text-sm text-muted-foreground">Criando instância...</p>
          </div>
        ) : state === 'waiting_scan' ? (
          <div className="flex flex-col items-center gap-4">
            <Badge variant="secondary">Aguardando escaneamento</Badge>
            {qrBase64 ? (
              <div className="rounded-lg border bg-white p-4">
                <img
                  src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                  alt="QR Code WhatsApp"
                  className="h-64 w-64"
                />
              </div>
            ) : (
              <Skeleton className="h-64 w-64" />
            )}
            <p className="text-center text-sm text-muted-foreground">
              Abra o WhatsApp no celular → Mais opções → Aparelhos conectados → Conectar aparelho
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefreshQR}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar QR
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/connect/${instanceName}`
                  navigator.clipboard.writeText(url)
                  toast.success('Link copiado!')
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar link público
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/connect/${instanceName}`, '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir
              </Button>
            </div>
          </div>
        ) : state === 'connected' ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-8 w-8" />
            </div>
            <p className="text-lg font-medium">WhatsApp conectado!</p>
            <Button onClick={() => onComplete(instanceName)}>
              Próximo
            </Button>
          </div>
        ) : null}

        {(state === 'idle' || state === 'waiting_scan') && (
          <div className="border-t pt-4">
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Pular por enquanto
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
