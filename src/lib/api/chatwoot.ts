import type {
  ChatwootInbox,
  ChatwootInboxListResponse,
  ChatwootAgent,
  ChatwootAccount,
} from '@/types/api'

const BASE_URL = process.env.CHATWOOT_URL!
const API_TOKEN = process.env.CHATWOOT_API_TOKEN!
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1'
const BOT_EMAIL_DOMAIN = process.env.CHATWOOT_BOT_EMAIL_DOMAIN || 'salestec.com'
const BOT_PASSWORD = process.env.CHATWOOT_BOT_PASSWORD!

// --- API regular (Account 1) ---

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

// --- Caminho B — Account isolada por cliente ---

// Cria nova Account Chatwoot + usuário admin em uma chamada.
// Retorna account_id e access_token do admin (usado pelo n8n como agente bot).
async function createAccountWithEmail(
  accountName: string,
  email: string,
  fullName: string
): Promise<ChatwootAccount> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      account_name: accountName,
      user_full_name: fullName,
      email,
      password: BOT_PASSWORD,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}:${body}`)
  }

  const data = await res.json()
  const account = data.data?.accounts?.[0]
  if (!account?.id) throw new Error('Chatwoot: resposta não contém account_id')

  return {
    id: account.id as number,
    name: account.name as string,
    access_token: data.data?.access_token as string,
  }
}

export async function createChatwootAccount(
  accountName: string,
  clientEmail: string,
  clientFullName: string,
  instanceName: string
): Promise<ChatwootAccount> {
  try {
    // Tenta com o email real do cliente
    return await createAccountWithEmail(accountName, clientEmail, clientFullName)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('already signed up') || msg.includes('400') || msg.includes('422')) {
      // Email já cadastrado — usa email gerado único como fallback
      const fallbackEmail = `bot-${instanceName}@${BOT_EMAIL_DOMAIN}`
      return await createAccountWithEmail(accountName, fallbackEmail, clientFullName)
    }
    throw new Error(`Chatwoot: falha ao criar Account — ${msg}`)
  }
}

// Deleta uma Account Chatwoot (best effort — ignora falha se não existir)
export async function deleteChatwootAccount(accountId: number, accountToken: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/v1/accounts/${accountId}`, {
      method: 'DELETE',
      headers: { api_access_token: accountToken },
    })
  } catch {
    // Ignora — conta pode já ter sido deletada manualmente
  }
}

// Configura webhook do Chatwoot → n8n na Account do cliente
export async function configureChatwootWebhook(
  accountId: number,
  accountToken: string,
  webhookUrl: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${accountId}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      api_access_token: accountToken,
    },
    body: JSON.stringify({
      url: webhookUrl,
      subscriptions: ['message_created', 'conversation_created', 'conversation_updated', 'conversation_status_changed'],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao configurar webhook Chatwoot ${res.status}: ${body}`)
  }
}

// Busca o inbox criado automaticamente pela Evolution API na Account do cliente
export async function findInboxByName(
  accountId: number,
  inboxName: string,
  accountToken: string
): Promise<ChatwootInbox | null> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${accountId}/inboxes`, {
    headers: {
      'Content-Type': 'application/json',
      api_access_token: accountToken,
    },
  })

  if (!res.ok) return null

  const data: ChatwootInboxListResponse = await res.json()
  return data.payload.find((inbox) => inbox.name === inboxName) ?? null
}
