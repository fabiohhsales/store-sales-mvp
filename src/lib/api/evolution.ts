import type {
  EvolutionConnectionState,
  EvolutionFetchInstance,
  EvolutionInstanceResponse,
  EvolutionQRCode,
} from '@/types/api'

const BASE_URL = process.env.EVOLUTION_API_URL!
const API_KEY = process.env.EVOLUTION_API_KEY!

async function evolutionFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    const cleanBody = body.startsWith('<!') ? '(HTML response - instancia pode nao existir)' : body
    throw new Error(`Evolution API error ${res.status}: ${cleanBody}`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const body = await res.text()
    throw new Error(`Evolution API retornou ${contentType} em vez de JSON: ${body.slice(0, 100)}`)
  }

  return res.json()
}

export function getPanelChatwootWebhookUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.warn('[App] NEXT_PUBLIC_APP_URL nao configurada - webhook Chatwoot apontara para localhost')
    return 'http://localhost:3000/api/webhooks/chatwoot'
  }
  return `${appUrl.replace(/\/$/, '')}/api/webhooks/chatwoot`
}

export function getPanelEvolutionWebhookUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.warn('[App] NEXT_PUBLIC_APP_URL nao configurada - webhook Evolution apontara para localhost')
    return 'http://localhost:3000/api/webhooks/evolution'
  }
  return `${appUrl.replace(/\/$/, '')}/api/webhooks/evolution`
}

export async function createInstance(
  instanceName: string,
  clientName: string,
  chatwootConfig: { accountId: number; agentToken: string }
): Promise<EvolutionInstanceResponse> {
  return evolutionFetch<EvolutionInstanceResponse>('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      chatwoot_account_id: String(chatwootConfig.accountId),
      chatwoot_token: chatwootConfig.agentToken,
      chatwoot_url: process.env.CHATWOOT_URL,
      chatwoot_sign_msg: false,
      chatwoot_reopen_conversation: true,
      chatwoot_conversation_pending: true,
      chatwoot_name_inbox: clientName,
      chatwoot_auto_create: true,
    }),
  })
}

export async function setChatwootIntegration(
  instanceName: string,
  accountId: number,
  agentToken: string,
  inboxName: string
): Promise<void> {
  await evolutionFetch(`/chatwoot/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      accountId: String(accountId),
      token: agentToken,
      url: process.env.CHATWOOT_URL,
      nameInbox: inboxName,
      signMsg: false,
      reopenConversation: true,
      conversationPending: true,
      autoCreate: true,
    }),
  })
}

export async function getConnectionState(
  instanceName: string
): Promise<EvolutionConnectionState> {
  return evolutionFetch<EvolutionConnectionState>(`/instance/connectionState/${instanceName}`)
}

export async function connectInstance(
  instanceName: string,
  phoneNumber?: string
): Promise<EvolutionQRCode> {
  const suffix = phoneNumber ? `?number=${encodeURIComponent(phoneNumber)}` : ''
  return evolutionFetch<EvolutionQRCode>(`/instance/connect/${instanceName}${suffix}`)
}

export async function fetchInstances(): Promise<EvolutionFetchInstance[]> {
  return evolutionFetch<EvolutionFetchInstance[]>('/instance/fetchInstances')
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/delete/${instanceName}`, {
    method: 'DELETE',
  })
}

interface EvolutionSendResponse {
  key?: { id?: string }
}

// Returns the Evolution message ID (key.id) or null on failure / unknown response.
export async function sendTextMessage(
  instanceName: string,
  remoteJid: string,
  text: string
): Promise<string | null> {
  try {
    const res = await evolutionFetch<EvolutionSendResponse>(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number: remoteJid, text }),
    })
    return res.key?.id ?? null
  } catch (err) {
    throw err // re-throw so callers still get the error
  }
}

export async function sendMediaMessage(
  instanceName: string,
  remoteJid: string,
  mediatype: 'image' | 'document' | 'video',
  mimetype: string,
  base64: string,
  caption?: string,
  fileName?: string
): Promise<string | null> {
  const res = await evolutionFetch<EvolutionSendResponse>(`/message/sendMedia/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: remoteJid,
      mediatype,
      mimetype,
      media: base64,
      caption: caption ?? undefined,
      fileName: fileName ?? undefined,
    }),
  })
  return res.key?.id ?? null
}

export async function sendAudioMessage(
  instanceName: string,
  remoteJid: string,
  _mimetype: string,
  base64: string,
  _caption?: string,
  _fileName?: string
): Promise<string | null> {
  const res = await evolutionFetch<EvolutionSendResponse>(`/message/sendWhatsAppAudio/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: remoteJid,
      audio: base64,
    }),
  })
  return res.key?.id ?? null
}

export async function sendMediaByUrl(
  instanceName: string,
  remoteJid: string,
  mediatype: 'image' | 'document' | 'video',
  mimetype: string,
  mediaUrl: string,
  caption?: string,
  fileName?: string
): Promise<string | null> {
  const res = await evolutionFetch<EvolutionSendResponse>(`/message/sendMedia/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: remoteJid,
      mediatype,
      mimetype,
      mediaUrl,
      caption: caption ?? undefined,
      fileName: fileName ?? undefined,
    }),
  })
  return res.key?.id ?? null
}

export async function setWebhook(
  instanceName: string,
  webhookUrl: string
): Promise<void> {
  await evolutionFetch(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    }),
  })
}
