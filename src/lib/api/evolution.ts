import type {
  EvolutionInstanceResponse,
  EvolutionConnectionState,
  EvolutionQRCode,
  EvolutionFetchInstance,
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
    const cleanBody = body.startsWith('<!') ? `(HTML response - instância pode não existir)` : body
    throw new Error(`Evolution API error ${res.status}: ${cleanBody}`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const body = await res.text()
    throw new Error(`Evolution API retornou ${contentType} em vez de JSON: ${body.slice(0, 100)}`)
  }

  return res.json()
}

// URL do webhook do painel — recebe eventos do Chatwoot e processa com o bot engine
export function getPanelWebhookUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.warn('[Evolution] NEXT_PUBLIC_APP_URL não configurada — webhook apontará para localhost')
    return 'http://localhost:3000/api/webhooks/chatwoot'
  }
  return `${appUrl.replace(/\/$/, '')}/api/webhooks/chatwoot`
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
  return evolutionFetch<EvolutionConnectionState>(
    `/instance/connectionState/${instanceName}`
  )
}

export async function connectInstance(
  instanceName: string
): Promise<EvolutionQRCode> {
  return evolutionFetch<EvolutionQRCode>(
    `/instance/connect/${instanceName}`
  )
}

export async function fetchInstances(): Promise<EvolutionFetchInstance[]> {
  return evolutionFetch<EvolutionFetchInstance[]>('/instance/fetchInstances')
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/delete/${instanceName}`, {
    method: 'DELETE',
  })
}

export async function sendTextMessage(
  instanceName: string,
  remoteJid: string,
  text: string
): Promise<void> {
  await evolutionFetch(`/message/sendText/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ number: remoteJid, text }),
  })
}

export async function setWebhook(
  instanceName: string,
  webhookUrl: string
): Promise<void> {
  await evolutionFetch(`/instance/webhook/${instanceName}`, {
    method: 'PUT',
    body: JSON.stringify({
      webhook: {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    }),
  })
}
