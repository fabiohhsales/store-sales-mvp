'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Check, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react'

type WhatsAppState = 'loading' | 'waiting_scan' | 'connected' | 'error'

export default function PublicConnectPage() {
  const { instanceName } = useParams<{ instanceName: string }>()

  const [whatsappState, setWhatsappState] = useState<WhatsAppState>('loading')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [whatsappError, setWhatsappError] = useState<string | null>(null)

  const fetchQR = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/public-qr`)
      if (!res.ok) {
        setWhatsappError('Instância não encontrada. Verifique o link.')
        setWhatsappState('error')
        return
      }

      const data = await res.json()

      if (data.state === 'open') {
        setWhatsappState('connected')
        return
      }

      if (data.qrcode?.base64) {
        setQrBase64(
          data.qrcode.base64.startsWith('data:')
            ? data.qrcode.base64
            : `data:image/png;base64,${data.qrcode.base64}`
        )
        setWhatsappState('waiting_scan')
      }
    } catch {
      setWhatsappError('Erro ao carregar QR code. Tente novamente.')
      setWhatsappState('error')
    }
  }, [instanceName])

  useEffect(() => {
    fetchQR()
  }, [fetchQR])

  useEffect(() => {
    if (whatsappState !== 'waiting_scan') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/instances/${instanceName}/public-qr`)
        const data = await res.json()
        if (data.state === 'open') {
          setWhatsappState('connected')
          clearInterval(interval)
        }
      } catch {
        // ignora erros de polling
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [whatsappState, instanceName])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Conectar WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sales Tec — Assistente de Agendamento</p>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              whatsappState === 'connected' ? 'bg-success/15' : 'bg-secondary'
            }`}>
              {whatsappState === 'connected' ? (
                <Check className="h-5 w-5 text-success" />
              ) : (
                <Smartphone className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Conectar WhatsApp</h2>
              <p className="text-xs text-muted-foreground">
                {whatsappState === 'connected'
                  ? 'Conectado com sucesso!'
                  : 'Escaneie o QR Code com seu WhatsApp'}
              </p>
            </div>
          </div>

          {whatsappState === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-56 w-56 animate-pulse rounded-lg bg-secondary" />
              <p className="text-sm text-muted-foreground">Carregando QR Code...</p>
            </div>
          )}

          {whatsappState === 'waiting_scan' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1">
                <Wifi className="h-3.5 w-3.5 text-warning" />
                <span className="text-xs font-medium text-warning">Aguardando conexão</span>
              </div>

              {qrBase64 && (
                <div className="rounded-xl border-2 border-border bg-white p-2">
                  <img src={qrBase64} alt="QR Code WhatsApp" className="h-56 w-56" />
                </div>
              )}

              <ol className="space-y-0.5 text-left text-xs text-muted-foreground">
                <li>1. Abra o <strong className="text-foreground">WhatsApp</strong> no celular</li>
                <li>2. <strong className="text-foreground">Mais opções</strong> (⋮) → <strong className="text-foreground">Aparelhos conectados</strong></li>
                <li>3. <strong className="text-foreground">Conectar aparelho</strong> → aponte a câmera aqui</li>
              </ol>

              <button
                onClick={fetchQR}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar QR Code
              </button>
            </div>
          )}

          {whatsappState === 'connected' && (
            <div className="flex items-center gap-3 rounded-lg bg-success/15 p-3">
              <Check className="h-5 w-5 text-success" />
              <span className="text-sm font-medium text-success">WhatsApp conectado!</span>
            </div>
          )}

          {whatsappState === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <WifiOff className="h-8 w-8 text-destructive" />
              <p className="text-center text-sm text-destructive">{whatsappError}</p>
              <button
                onClick={() => { setWhatsappState('loading'); setWhatsappError(null); fetchQR() }}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {whatsappState === 'connected' && (
          <div className="rounded-2xl bg-primary p-6 text-center text-primary-foreground shadow-xl">
            <Check className="mx-auto mb-2 h-10 w-10" />
            <h2 className="text-lg font-bold">Tudo pronto!</h2>
            <p className="mt-1 text-sm text-primary-foreground/80">
              WhatsApp conectado. Sua equipe da Sales Tec finalizará a configuração do assistente. Você pode fechar esta página.
            </p>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground/50">Powered by Sales Tec</p>
        </div>
      </div>
    </div>
  )
}
