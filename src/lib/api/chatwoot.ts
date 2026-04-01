import type {
  ChatwootInbox,
  ChatwootInboxListResponse,
  ChatwootAgent,
  ChatwootAccount,
  ChatwootAgentInput,
} from '@/types/api'
import type { StageLabelConfig } from '@/types/database'

interface ChatwootLabel {
  title: string
  description?: string | null
}

interface ChatwootLabelListResponse {
  payload: ChatwootLabel[]
}

const BASE_URL = process.env.CHATWOOT_URL!
const API_TOKEN = process.env.CHATWOOT_API_TOKEN!
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1'
const BOT_EMAIL_DOMAIN = process.env.CHATWOOT_BOT_EMAIL_DOMAIN || 'salestec.com'
const BOT_PASSWORD = process.env.CHATWOOT_BOT_PASSWORD!
const PLATFORM_TOKEN = process.env.CHATWOOT_PLATFORM_TOKEN || ''

export interface ChatwootAgentCreateResult {
  status: 'created' | 'exists'
  agent?: ChatwootAgent
}

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

export async function deleteInbox(inboxId: number): Promise<void> {
  await chatwootFetch(`/inboxes/${inboxId}`, { method: 'DELETE' })
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
    login_email: email,
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

// Deleta uma Account Chatwoot.
// Tenta Platform API primeiro, depois fallback pra Super Admin session.
export async function deleteChatwootAccount(accountId: number, _accountToken?: string): Promise<{ deleted: boolean; error?: string }> {
  void _accountToken

  // Tentativa 1: Platform API (funciona se a account foi criada pela Platform App)
  if (PLATFORM_TOKEN) {
    try {
      const res = await fetch(`${BASE_URL}/platform/api/v1/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { api_access_token: PLATFORM_TOKEN },
      })
      if (res.ok) {
        console.log(`[Chatwoot] Account ${accountId} deletada via Platform API`)
        return { deleted: true }
      }
    } catch {
      // Segue pro fallback
    }
  }

  // Tentativa 2: Super Admin Devise session (funciona pra qualquer account)
  const superEmail = process.env.CHATWOOT_SUPER_ADMIN_EMAIL
  const superPassword = process.env.CHATWOOT_SUPER_ADMIN_PASSWORD
  if (superEmail && superPassword) {
    try {
      return await deleteChatwootAccountViaSuperAdmin(accountId, superEmail, superPassword)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error(`[Chatwoot] Super Admin delete falhou para Account ${accountId}:`, msg)
      return { deleted: false, error: msg }
    }
  }

  return { deleted: false, error: 'Nenhum método de deleção disponível. Configure CHATWOOT_PLATFORM_TOKEN ou CHATWOOT_SUPER_ADMIN_EMAIL/PASSWORD.' }
}

// Deleta account via Super Admin panel (Devise session + CSRF)
async function deleteChatwootAccountViaSuperAdmin(
  accountId: number,
  email: string,
  password: string
): Promise<{ deleted: boolean; error?: string }> {
  // 1. Buscar página de login pra pegar CSRF token e cookies
  const loginPageRes = await fetch(`${BASE_URL}/super_admin/sign_in`, {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
  })
  const loginPageHtml = await loginPageRes.text()

  const csrfMatch = loginPageHtml.match(/name="authenticity_token"[^>]*value="([^"]+)"/)
  if (!csrfMatch) {
    return { deleted: false, error: 'Não encontrou CSRF token na página de login do Super Admin' }
  }
  const csrfToken = csrfMatch[1]

  // Extrair cookies da resposta
  const setCookies = loginPageRes.headers.getSetCookie?.() ?? []
  const cookieString = setCookies.map(c => c.split(';')[0]).join('; ')

  // 2. Login via Devise form
  const loginRes = await fetch(`${BASE_URL}/super_admin/sign_in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieString,
    },
    body: new URLSearchParams({
      'authenticity_token': csrfToken,
      'user[email]': email,
      'user[password]': password,
    }).toString(),
    redirect: 'manual',
  })

  // Devise redireciona (302) em caso de sucesso
  if (loginRes.status !== 302 && loginRes.status !== 200) {
    return { deleted: false, error: `Login Super Admin falhou: ${loginRes.status}` }
  }

  // Combinar cookies da sessão
  const loginCookies = loginRes.headers.getSetCookie?.() ?? []
  const allCookies = [...setCookies, ...loginCookies].map(c => c.split(';')[0]).join('; ')

  // 3. Pegar CSRF token da página do super admin (pós-login)
  const adminPageRes = await fetch(`${BASE_URL}/super_admin/accounts`, {
    headers: { Accept: 'text/html', Cookie: allCookies },
    redirect: 'follow',
  })
  const adminPageHtml = await adminPageRes.text()
  const adminCsrfMatch = adminPageHtml.match(/name="csrf-token" content="([^"]+)"/)
    || adminPageHtml.match(/name="authenticity_token"[^>]*value="([^"]+)"/)
  const adminCsrf = adminCsrfMatch?.[1] || csrfToken

  // 4. Deletar account via Super Admin
  const deleteRes = await fetch(`${BASE_URL}/super_admin/accounts/${accountId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: allCookies,
      'X-CSRF-Token': adminCsrf,
    },
    body: new URLSearchParams({ 'authenticity_token': adminCsrf }).toString(),
    redirect: 'manual',
  })

  if (deleteRes.status === 200 || deleteRes.status === 302 || deleteRes.status === 204) {
    console.log(`[Chatwoot] Account ${accountId} deletada via Super Admin`)
    return { deleted: true }
  }

  return { deleted: false, error: `Super Admin delete retornou ${deleteRes.status}` }
}

// --- Ações de conversa por Account isolada do cliente ---

export async function updateConversationStatus(
  accountId: number,
  accountToken: string,
  chatwootConversationId: number,
  status: 'open' | 'pending' | 'resolved'
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${accountId}/conversations/${chatwootConversationId}/toggle_status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: accountToken,
      },
      body: JSON.stringify({ status }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot toggle_status ${res.status}: ${body}`)
  }
}

export async function updateConversationLabels(
  accountId: number,
  accountToken: string,
  chatwootConversationId: number,
  labels: string[]
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${accountId}/conversations/${chatwootConversationId}/labels`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: accountToken,
      },
      body: JSON.stringify({ labels }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot labels ${res.status}: ${body}`)
  }
}

export async function listChatwootStageLabels(
  accountId: number,
  accountToken: string
): Promise<StageLabelConfig[]> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${accountId}/labels`, {
    headers: {
      'Content-Type': 'application/json',
      api_access_token: accountToken,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot list labels ${res.status}: ${body}`)
  }

  const data: ChatwootLabelListResponse = await res.json()
  return data.payload
    .filter((item) => !!item.title)
    .map((item) => ({
      slug: item.title,
      display_name: item.description?.trim() || item.title,
    }))
}

async function createAccountLabel(
  accountId: number,
  accountToken: string,
  stageLabel: StageLabelConfig
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${accountId}/labels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      api_access_token: accountToken,
    },
    body: JSON.stringify({
      title: stageLabel.slug,
      description: stageLabel.display_name,
      show_on_sidebar: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot create label ${res.status}: ${body}`)
  }
}

export async function ensureChatwootLabels(
  accountId: number,
  accountToken: string,
  stageLabels: StageLabelConfig[]
): Promise<void> {
  if (stageLabels.length === 0) return

  let existing = new Set<string>()
  try {
    const labels = await listChatwootStageLabels(accountId, accountToken)
    existing = new Set(labels.map((item) => item.slug))
  } catch (err) {
    console.warn(`[Chatwoot] Falha ao listar labels da account ${accountId}; tentando criar direto`, err)
  }

  for (const label of stageLabels) {
    if (existing.has(label.slug)) continue

    try {
      await createAccountLabel(accountId, accountToken, label)
      existing.add(label.slug)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('already') || msg.includes('taken') || msg.includes('422')) {
        continue
      }
      throw err
    }
  }
}

export async function createChatwootAgent(
  accountId: number,
  accountToken: string,
  agent: ChatwootAgentInput
): Promise<ChatwootAgentCreateResult> {
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${accountId}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      api_access_token: accountToken,
    },
    body: JSON.stringify({
      name: agent.name,
      email: agent.email,
      role: agent.role,
    }),
  })

  if (res.ok) {
    const created: ChatwootAgent = await res.json()
    return {
      status: 'created',
      agent: created,
    }
  }

  const body = await res.text()
  const lowered = body.toLowerCase()
  if (res.status === 422 && (lowered.includes('already') || lowered.includes('taken') || lowered.includes('exists') || lowered.includes('signed up'))) {
    return { status: 'exists' }
  }

  throw new Error(`Chatwoot create agent ${res.status}: ${body}`)
}

// Configura webhook do Chatwoot → painel na Account do cliente
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
    const lowered = body.toLowerCase()
    if (
      res.status === 422 &&
      lowered.includes('url has already been taken')
    ) {
      console.warn(`[Chatwoot] Webhook já existente na account ${accountId}: ${webhookUrl}`)
      return
    }
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
