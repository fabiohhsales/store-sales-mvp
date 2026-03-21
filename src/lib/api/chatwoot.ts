import type {
  ChatwootInbox,
  ChatwootInboxListResponse,
  ChatwootAgent,
} from '@/types/api'

const BASE_URL = process.env.CHATWOOT_URL!
const API_TOKEN = process.env.CHATWOOT_API_TOKEN!
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1'

async function chatwootFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      api_access_token: API_TOKEN,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot API error ${res.status}: ${body}`)
  }

  return res.json()
}

export async function listInboxes(): Promise<ChatwootInbox[]> {
  const data = await chatwootFetch<ChatwootInboxListResponse>('/inboxes')
  return data.payload
}

export async function updateInbox(
  inboxId: number,
  updates: Partial<Pick<ChatwootInbox, 'working_hours_enabled' | 'out_of_office_message' | 'greeting_enabled' | 'greeting_message'>>
): Promise<ChatwootInbox> {
  return chatwootFetch<ChatwootInbox>(`/inboxes/${inboxId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function listAgents(): Promise<ChatwootAgent[]> {
  return chatwootFetch<ChatwootAgent[]>('/agents')
}
