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
    throw new Error(`Evolution API error ${res.status}: ${body}`)
  }

  return res.json()
}

// Webhook UUID do workflow principal no n8n (compartilhado por todas as instâncias)
const N8N_WEBHOOK_ID = '253b1c3f-3b78-470f-acdc-20bc6b7ef0cc'

export function getN8nWebhookUrl(): string {
  return `${process.env.N8N_URL}/webhook/${N8N_WEBHOOK_ID}`
}

export async function createInstance(
  instanceName: string,
  clientName: string
): Promise<EvolutionInstanceResponse> {
  const n8nWebhookUrl = getN8nWebhookUrl()

  return evolutionFetch<EvolutionInstanceResponse>('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      chatwoot_account_id: process.env.CHATWOOT_ACCOUNT_ID || '1',
      chatwoot_token: process.env.CHATWOOT_API_TOKEN,
      chatwoot_url: process.env.CHATWOOT_URL,
      chatwoot_sign_msg: false,
      chatwoot_reopen_conversation: true,
      chatwoot_conversation_pending: true,
      chatwoot_name_inbox: clientName,
      chatwoot_auto_create: true,
      webhook: {
        url: n8nWebhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
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
