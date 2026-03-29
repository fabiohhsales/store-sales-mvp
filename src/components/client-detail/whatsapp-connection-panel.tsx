'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Copy, ExternalLink, RefreshCw, Smartphone } from 'lucide-react'

type ConnectionState = 'idle' | 'creating' | 'waiting_scan' | 'connected'

interface WhatsAppConnectionPanelProps {
  clientId: string
  initialInstanceName?: string | null
  clientName?: string | null
}

function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function WhatsAppConnectionPanel({
  clientId,
  initialInstanceName,
  clientName,
}: WhatsAppConnectionPanelProps) {
  const router = useRouter()
  const [instanceName, setInstanceName] = useState(initialInstanceName ?? '')
  const [inputName, setInputName] = useState(() => slugify(clientName ?? 'cliente'))
  const [state, setState] = useState<ConnectionState>('idle')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hasInstance = !!instanceName
  const isReconnect = !!initialInstanceName

  const publicLink = useMemo(
    () => (instanceName ? `/connect/${instanceName}` : ''),
    [instanceName]
  )

  const checkStatus = useCallback(async (name: string) => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${name}/status`)
      const data = await res.json()
      if (data.state === 'open') {
        setState('connected')
        setQrBase64(null)
        toast.success('WhatsApp conectado!')
        router.refresh()
        return true
      }
    } catch {
      // ignore polling errors
    }
    return false
  }, [router])

  useEffect(() => {
    if (state !== 'waiting_scan' || !instanceName) return

    const interval = setInterval(async () => {
      const connected = await checkStatus(instanceName)
      if (connected) clearInterval(interval)
    }, 3000)

    return () => clearInterval(interval)
  }, [state, instanceName, checkStatus])

  const handleCreateInstance = async () => {
    if (!inputName.trim()) {
      toast.error('Informe o nome da instância')
      return
    }

    setLoading(true)
    setState('creating')

    try {
      const name = inputName.trim()
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          instance_name: name,
        }),
      })

      const text = await res.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Erro interno do servidor (${res.status})`)
      }

      if (!res.ok) {
        throw new Error((data.error as string) || 'Erro ao criar instância')
      }

      setInstanceName(name)
      setState('waiting_scan')
      const qrcode = data.qrcode as { base64?: string } | undefined
      if (qrcode?.base64) setQrBase64(qrcode.base64)
      toast.success('Instância criada! Escaneie o QR Code.')
      router.refresh()
    } catch (error) {
      setState('idle')
      const message = error instanceof Error ? error.message : 'Erro ao criar instância'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateQr = async () => {
    if (!instanceName) return

    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/qrcode`)
      if (!res.ok) throw new Error('Erro ao gerar QR Code')

      const data = await res.json()
      if (data.base64) {
        setQrBase64(data.base64)
        setState('waiting_scan')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar QR Code'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" />
          {hasInstance ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
        </CardTitle>
        <CardDescription>
          {hasInstance
            ? 'Gere um novo QR Code para reconectar o número desta instância.'
            : 'Crie a instância do WhatsApp para habilitar conexão e link público.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasInstance && (
          <div className="space-y-2">
            <Label htmlFor="instance-name">Nome da instância</Label>
            <Input
              id="instance-name"
              placeholder="clinica-dr-silva"
              value={inputName}
              onChange={(e) => setInputName(slugify(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Use letras minúsculas, números e hífens.
            </p>
            <Button onClick={handleCreateInstance} disabled={loading || !inputName.trim()}>
              {loading && state === 'creating' ? 'Criando...' : 'Criar instância'}
            </Button>
          </div>
        )}

        {hasInstance && (
          <div className="flex flex-wrap items-center gap-2">
            {state === 'connected' ? (
              <Badge className="bg-success text-success-foreground">Conectado</Badge>
            ) : (
              <Badge variant="secondary">Instância: {instanceName}</Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleGenerateQr} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {isReconnect ? 'Gerar QR' : 'Gerar primeiro QR'}
            </Button>
            {publicLink && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}${publicLink}`
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
                  onClick={() => window.open(publicLink, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir link
                </Button>
              </>
            )}
          </div>
        )}

        {loading && state !== 'creating' && !qrBase64 && hasInstance && (
          <Skeleton className="mx-auto h-56 w-56" />
        )}

        {qrBase64 && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR code base64 data URL */}
              <img
                src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code WhatsApp"
                className="h-56 w-56"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Escaneie com o WhatsApp para conectar esta instância.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}