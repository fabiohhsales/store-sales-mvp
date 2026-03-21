'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { RefreshCw, Smartphone } from 'lucide-react'

interface WhatsAppReconnectProps {
  instanceName: string
}

export function WhatsAppReconnect({ instanceName }: WhatsAppReconnectProps) {
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/health/${instanceName}`)
      const data = await res.json()
      if (data.state === 'open') {
        setConnected(true)
        setQrBase64(null)
        return true
      }
    } catch { /* ignore */ }
    return false
  }, [instanceName])

  useEffect(() => {
    if (!qrBase64) return
    const interval = setInterval(async () => {
      const ok = await checkStatus()
      if (ok) {
        clearInterval(interval)
        toast.success('WhatsApp reconectado!')
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [qrBase64, checkStatus])

  const handleReconnect = async () => {
    setLoading(true)
    setConnected(false)
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/qrcode`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setQrBase64(data.base64)
    } catch {
      toast.error('Erro ao gerar QR Code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" />
          Reconectar WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        {connected ? (
          <p className="text-sm text-green-600 font-medium">Conectado!</p>
        ) : qrBase64 ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border bg-white p-3">
              <img
                src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code"
                className="h-48 w-48"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Escaneie com o WhatsApp
            </p>
            <Button variant="outline" size="sm" onClick={handleReconnect}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Novo QR
            </Button>
          </div>
        ) : loading ? (
          <Skeleton className="h-48 w-48 mx-auto" />
        ) : (
          <Button variant="outline" size="sm" onClick={handleReconnect}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Gerar QR Code
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
