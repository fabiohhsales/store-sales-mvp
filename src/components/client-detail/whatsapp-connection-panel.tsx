'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Smartphone,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { WhatsAppConnectionResponse } from '@/types/api'

type ConnectionState = WhatsAppConnectionResponse['state'] | 'idle' | 'creating'

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

function normalizeConnectionState(state: string | null | undefined): ConnectionState {
  if (state === 'open' || state === 'connecting' || state === 'disconnected' || state === 'error') {
    return state
  }
  return 'idle'
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
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null)
  const [pairingPhone, setPairingPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [repairing, setRepairing] = useState(false)

  const hasInstance = !!instanceName
  const isReconnect = !!initialInstanceName

  const publicLink = useMemo(
    () => (instanceName ? `/connect/${instanceName}` : ''),
    [instanceName]
  )

  const applyConnectionPayload = useCallback((data: Partial<WhatsAppConnectionResponse>) => {
    const nextState = normalizeConnectionState(data.state)
    setState(nextState)
    setConnectedPhone(data.connectedPhone ?? null)

    if (nextState === 'open') {
      setQrBase64(null)
      setPairingCode(null)
      return true
    }

    setQrBase64(data.base64 ?? null)
    setPairingCode(data.pairingCode ?? null)
    return false
  }, [])

  const checkStatus = useCallback(async (name: string) => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${name}/status`, { cache: 'no-store' })
      const data = await res.json()
      const connected = applyConnectionPayload(data)
      if (connected) {
        toast.success('WhatsApp conectado!')
        router.refresh()
      }
      return connected
    } catch {
      setState('error')
      return false
    }
  }, [applyConnectionPayload, router])

  useEffect(() => {
    if (!instanceName) return
    void checkStatus(instanceName)
  }, [instanceName, checkStatus])

  useEffect(() => {
    if (!instanceName || state !== 'connecting') return

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
      applyConnectionPayload({
        state: 'connecting',
        base64: (data.qrcode as { base64?: string } | undefined)?.base64 ?? null,
        pairingCode: (data.qrcode as { pairingCode?: string } | undefined)?.pairingCode ?? null,
        connectedPhone: null,
      })
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
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/qrcode`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar QR Code')
      applyConnectionPayload(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar QR Code'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handlePairingCode = async () => {
    if (!instanceName) return

    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/pairing-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: pairingPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar codigo de pareamento')
      applyConnectionPayload(data)
      if (data.pairingCode) {
        toast.success('Codigo de pareamento gerado.')
      } else {
        toast.message('A Evolution nao retornou codigo. Tente novamente com QR.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar codigo de pareamento')
    } finally {
      setLoading(false)
    }
  }

  const handleRepairSync = async () => {
    if (!instanceName) return

    setRepairing(true)
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/repair-sync`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao reparar sincronizacao')
      applyConnectionPayload(data)
      toast.success('Sincronização reparada.')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao reparar sincronizacao')
    } finally {
      setRepairing(false)
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
            ? 'Acompanhe o estado real da instância e gere QR apenas quando necessário.'
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
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={state === 'open' ? 'default' : 'secondary'}>
                {state === 'open'
                  ? 'Conectado'
                  : state === 'connecting'
                    ? 'Aguardando conexão'
                    : state === 'error'
                      ? 'Erro de monitoramento'
                      : `Instância: ${instanceName}`}
              </Badge>

              <Button variant="outline" size="sm" onClick={handleGenerateQr} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isReconnect ? 'Gerar QR' : 'Gerar primeiro QR'}
              </Button>

              <Button variant="outline" size="sm" onClick={handleRepairSync} disabled={repairing}>
                <Wrench className="mr-2 h-4 w-4" />
                {repairing ? 'Reparando...' : 'Reparar sincronização'}
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

            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
              <p>
                Estado atual: <span className="font-medium text-foreground">{state}</span>
              </p>
              <p>
                Número conectado: <span className="font-medium text-foreground">{connectedPhone ?? 'não informado'}</span>
              </p>
            </div>
          </>
        )}

        {loading && state !== 'creating' && !qrBase64 && hasInstance && (
          <Skeleton className="mx-auto h-56 w-56" />
        )}

        {qrBase64 && state !== 'open' && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR code base64 data URL */}
              <img
                src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code WhatsApp"
                className="h-56 w-56"
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Escaneie com o WhatsApp para conectar esta instância.
            </p>
          </div>
        )}

        {hasInstance && state !== 'open' && (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Modo alternativo: código por telefone</p>
                <p className="text-xs text-muted-foreground">
                  Experimental. Use somente se o QR continuar instável.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pairing-phone">Número com DDI</Label>
              <Input
                id="pairing-phone"
                placeholder="5511999999999"
                value={pairingPhone}
                onChange={(e) => setPairingPhone(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handlePairingCode} disabled={loading || !pairingPhone.trim()}>
                Gerar código por telefone
              </Button>
              {pairingCode && (
                <div className="rounded-md bg-secondary px-3 py-2 text-sm">
                  Código: <span className="font-mono font-semibold text-foreground">{pairingCode}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
