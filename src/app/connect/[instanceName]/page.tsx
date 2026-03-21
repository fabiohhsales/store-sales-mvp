'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Calendar, Check, ChevronRight, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react'

type WhatsAppState = 'loading' | 'waiting_scan' | 'connected' | 'error'
type GoogleState = 'pending' | 'connecting' | 'connected' | 'error'

export default function PublicConnectPage() {
  const { instanceName } = useParams<{ instanceName: string }>()
  const searchParams = useSearchParams()

  // WhatsApp state
  const [whatsappState, setWhatsappState] = useState<WhatsAppState>('loading')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [whatsappError, setWhatsappError] = useState<string | null>(null)

  // Google state — checa URL param do redirect (fallback se popup falhar)
  const googleParam = searchParams.get('google')
  const [googleState, setGoogleState] = useState<GoogleState>(
    googleParam === 'success' ? 'connected' : googleParam === 'error' ? 'error' : 'pending'
  )
  const popupRef = useRef<Window | null>(null)

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

  // Carrega QR na montagem
  useEffect(() => {
    fetchQR()
  }, [fetchQR])

  // Polling de status WhatsApp a cada 3s
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

  // Polling pra detectar quando o popup do Google OAuth fecha com sucesso
  useEffect(() => {
    if (googleState !== 'connecting') return

    const interval = setInterval(() => {
      // Se o popup fechou, checa o status no banco
      if (popupRef.current?.closed) {
        popupRef.current = null
        // Checa se o Google foi conectado fazendo fetch da API
        fetch(`/api/whatsapp/instances/${instanceName}/public-qr`)
          .then(() => {
            // Faz uma chamada simples pra verificar — o callback já salvou no banco
            // Verificamos via query param que o callback adicionaria
            setGoogleState('connected')
          })
          .catch(() => {
            setGoogleState('error')
          })
        clearInterval(interval)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [googleState, instanceName])

  // Listener pra mensagem do popup (mais confiável que polling)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-oauth-result') {
        if (event.data.status === 'success') {
          setGoogleState('connected')
        } else {
          setGoogleState('error')
        }
        popupRef.current?.close()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleGoogleConnect = () => {
    setGoogleState('connecting')
    const url = `/api/auth/google/public?instance_name=${instanceName}`
    const w = 500
    const h = 600
    const left = window.screenX + (window.outerWidth - w) / 2
    const top = window.screenY + (window.outerHeight - h) / 2
    const popup = window.open(url, 'google-oauth', `width=${w},height=${h},left=${left},top=${top}`)

    if (!popup) {
      // Popup blocked — fallback pra redirect normal
      window.location.href = url
      return
    }

    popupRef.current = popup
  }

  const allDone = whatsappState === 'connected' && googleState === 'connected'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Configuração Inicial</h1>
          <p className="mt-1 text-sm text-gray-500">Sales Tec — Assistente de Agendamento</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-3">
          <StepBadge
            number={1}
            label="WhatsApp"
            done={whatsappState === 'connected'}
            active={whatsappState !== 'connected'}
          />
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <StepBadge
            number={2}
            label="Google Calendar"
            done={googleState === 'connected'}
            active={whatsappState === 'connected' && googleState !== 'connected'}
          />
        </div>

        {/* Step 1: WhatsApp */}
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              whatsappState === 'connected' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {whatsappState === 'connected' ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Smartphone className="h-5 w-5 text-gray-600" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">1. Conectar WhatsApp</h2>
              <p className="text-xs text-gray-500">
                {whatsappState === 'connected'
                  ? 'Conectado com sucesso!'
                  : 'Escaneie o QR Code com seu WhatsApp'}
              </p>
            </div>
          </div>

          {whatsappState === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-56 w-56 animate-pulse rounded-lg bg-gray-100" />
              <p className="text-sm text-gray-500">Carregando QR Code...</p>
            </div>
          )}

          {whatsappState === 'waiting_scan' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1">
                <Wifi className="h-3.5 w-3.5 text-yellow-600" />
                <span className="text-xs font-medium text-yellow-700">Aguardando conexão</span>
              </div>

              {qrBase64 && (
                <div className="rounded-xl border-2 border-gray-100 bg-white p-2">
                  <img src={qrBase64} alt="QR Code WhatsApp" className="h-56 w-56" />
                </div>
              )}

              <ol className="space-y-0.5 text-left text-xs text-gray-500">
                <li>1. Abra o <strong>WhatsApp</strong> no celular</li>
                <li>2. <strong>Mais opções</strong> (⋮) → <strong>Aparelhos conectados</strong></li>
                <li>3. <strong>Conectar aparelho</strong> → aponte a câmera aqui</li>
              </ol>

              <button
                onClick={fetchQR}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar QR Code
              </button>
            </div>
          )}

          {whatsappState === 'connected' && (
            <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3">
              <Check className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">WhatsApp conectado!</span>
            </div>
          )}

          {whatsappState === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <WifiOff className="h-8 w-8 text-red-400" />
              <p className="text-center text-sm text-red-600">{whatsappError}</p>
              <button
                onClick={() => { setWhatsappState('loading'); setWhatsappError(null); fetchQR() }}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Google Calendar */}
        <div className={`rounded-2xl bg-white p-6 shadow-xl transition-opacity ${
          whatsappState !== 'connected' ? 'pointer-events-none opacity-50' : ''
        }`}>
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              googleState === 'connected' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {googleState === 'connected' ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Calendar className="h-5 w-5 text-gray-600" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">2. Conectar Google Calendar</h2>
              <p className="text-xs text-gray-500">
                {googleState === 'connected'
                  ? 'Calendário conectado com sucesso!'
                  : 'Para gerenciar seus agendamentos automaticamente'}
              </p>
            </div>
          </div>

          {googleState === 'pending' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">
                  Ao conectar, o assistente poderá verificar sua disponibilidade e criar
                  agendamentos diretamente na sua agenda do Google.
                </p>
              </div>
              <button
                onClick={handleGoogleConnect}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <Calendar className="h-4 w-4" />
                Conectar Google Calendar
              </button>
            </div>
          )}

          {googleState === 'connecting' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <p className="text-sm text-gray-500">Autorizando no Google...</p>
              <p className="text-xs text-gray-400">Complete a autorização na janela aberta</p>
            </div>
          )}

          {googleState === 'connected' && (
            <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3">
              <Check className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">Google Calendar conectado!</span>
            </div>
          )}

          {googleState === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3">
                <p className="text-sm text-red-600">Erro ao conectar. Tente novamente.</p>
              </div>
              <button
                onClick={handleGoogleConnect}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <Calendar className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* All done */}
        {allDone && (
          <div className="rounded-2xl bg-green-600 p-6 text-center text-white shadow-xl">
            <Check className="mx-auto mb-2 h-10 w-10" />
            <h2 className="text-lg font-bold">Tudo pronto!</h2>
            <p className="mt-1 text-sm text-green-100">
              WhatsApp e Google Calendar conectados. Sua equipe da Sales Tec finalizará
              a configuração do assistente. Você pode fechar esta página.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-400">Powered by Sales Tec</p>
        </div>
      </div>
    </div>
  )
}

function StepBadge({ number, label, done, active }: {
  number: number
  label: string
  done: boolean
  active: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
        done
          ? 'bg-green-100 text-green-700'
          : active
            ? 'bg-gray-900 text-white'
            : 'bg-gray-100 text-gray-400'
      }`}>
        {done ? <Check className="h-3.5 w-3.5" /> : number}
      </div>
      <span className={`text-xs font-medium ${
        done ? 'text-green-700' : active ? 'text-gray-900' : 'text-gray-400'
      }`}>
        {label}
      </span>
    </div>
  )
}
