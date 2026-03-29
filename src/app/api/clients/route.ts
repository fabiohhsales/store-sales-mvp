import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClientRecord, updateClient, listClients } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import {
  createChatwootAccount,
  createChatwootAgent,
  configureChatwootWebhook,
  deleteChatwootAccount,
  ensureChatwootLabels,
} from '@/lib/api/chatwoot'
import { getPanelWebhookUrl } from '@/lib/api/evolution'
import { DEFAULT_STAGE_LABELS } from '@/lib/bot/stage-labels'
import type { PanelClientInsert, ProvisionedChatwootAgent } from '@/types/database'
import type { ChatwootAgentRole } from '@/types/api'

interface ChatwootProvisioningResult {
  ok: boolean
  accountId: number | null
  loginEmail: string | null
  error: string | null
}

function parseChatwootUsers(input: unknown): ProvisionedChatwootAgent[] {
  if (!Array.isArray(input)) return []

  const parsed = input
    .map((item) => {
      const record = item as Record<string, unknown>
      const name = typeof record?.name === 'string' ? record.name.trim() : ''
      const email = typeof record?.email === 'string' ? record.email.trim().toLowerCase() : ''
      const role: ChatwootAgentRole = record?.role === 'administrator' ? 'administrator' : 'agent'
      return { name, email, role }
    })
    .filter((item) => item.name.length > 0 || item.email.length > 0)

  if (parsed.some((item) => !item.name || !item.email)) {
    throw new Error('Todos os agentes Chatwoot devem ter nome e e-mail')
  }

  const invalidEmail = parsed.find((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))
  if (invalidEmail) {
    throw new Error(`E-mail invalido na lista de agentes: ${invalidEmail.email}`)
  }

  const emailSet = new Set(parsed.map((item) => item.email))
  if (emailSet.size !== parsed.length) {
    throw new Error('Nao repita e-mails na lista de agentes Chatwoot')
  }

  return parsed
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const clients = await listClients()
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Erro ao listar clientes:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, owner_name, email, phone, business_segment } = body

    let chatwootUsers: ProvisionedChatwootAgent[] = []
    try {
      chatwootUsers = parseChatwootUsers(body.chatwoot_users)
    } catch (payloadError) {
      const message = payloadError instanceof Error ? payloadError.message : 'Payload de agentes Chatwoot invalido'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    if (!name || !owner_name || !email) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: name, owner_name, email' },
        { status: 400 }
      )
    }

    const clientData: PanelClientInsert = {
      name,
      owner_name,
      email,
      phone: phone || null,
      provisioned_agents: chatwootUsers,
      status: 'draft',
    }

    const client = await createClientRecord(clientData)

    let provisioning: ChatwootProvisioningResult
    try {
      provisioning = await provisionChatwootForClient(client.id, name, email, owner_name, chatwootUsers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao provisionar Chatwoot'
      console.error(`[Clients] Falha ao provisionar Chatwoot para cliente ${client.id}:`, err)
      provisioning = {
        ok: false,
        accountId: null,
        loginEmail: null,
        error: message,
      }
    }

    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_created',
      client_id: client.id,
      details: {
        name,
        owner_name,
        email,
        phone,
        business_segment,
        provisioned_agents_count: chatwootUsers.length,
        chatwoot_provisioned: provisioning.ok,
        chatwoot_provisioning_error: provisioning.error,
      },
    })

    return NextResponse.json(
      {
        ...client,
        chatwoot_account_id: provisioning.accountId ?? client.chatwoot_account_id ?? null,
        chatwoot_email: provisioning.loginEmail ?? client.chatwoot_email ?? null,
        chatwoot_provisioning: provisioning,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erro ao criar cliente:', error)
    return NextResponse.json(
      { error: 'Erro interno ao criar cliente' },
      { status: 500 }
    )
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error('unreachable')
}

async function provisionChatwootForClient(
  clientId: string,
  name: string,
  email: string,
  ownerName: string,
  agents: ProvisionedChatwootAgent[]
) : Promise<ChatwootProvisioningResult> {
  let createdAccountId: number | null = null
  let createdAccountToken: string | null = null

  try {
    console.log(`[Clients] Provisionando Chatwoot para cliente "${name}" (${clientId})`)

    // Usa um nome de instância temporário para criar a account antes do WhatsApp
    const tempInstanceName = `client-${clientId.slice(0, 8)}`

    const account = await withRetry(() => createChatwootAccount(name, email, ownerName, tempInstanceName))
    createdAccountId = account.id
    createdAccountToken = account.access_token

    const panelWebhookUrl = getPanelWebhookUrl()
    await withRetry(() => configureChatwootWebhook(account.id, account.access_token, panelWebhookUrl))

    try {
      await ensureChatwootLabels(account.id, account.access_token, DEFAULT_STAGE_LABELS)
    } catch (err) {
      console.warn('[Clients] Sync de etiquetas padrão no Chatwoot falhou (não-crítico):', err)
    }

    for (const agent of agents) {
      try {
        await createChatwootAgent(account.id, account.access_token, agent)
      } catch (err) {
        console.warn(`[Clients] Falha ao criar agente Chatwoot ${agent.email} (não-crítico):`, err)
      }
    }

    await updateClient(clientId, {
      chatwoot_account_id: account.id,
      chatwoot_agent_token: account.access_token,
      chatwoot_email: account.login_email ?? email,
    })

    console.log(`[Clients] Chatwoot provisionado: Account #${account.id} para cliente ${clientId}`)
    return {
      ok: true,
      accountId: account.id,
      loginEmail: account.login_email ?? email,
      error: null,
    }
  } catch (err) {
    if (createdAccountId && createdAccountToken) {
      try {
        const cleanup = await deleteChatwootAccount(createdAccountId, createdAccountToken)
        if (!cleanup.deleted) {
          console.warn(
            `[Clients] Cleanup da account Chatwoot ${createdAccountId} falhou: ${cleanup.error ?? 'sem detalhes'}`
          )
        }
      } catch (cleanupError) {
        console.warn(`[Clients] Erro ao limpar account Chatwoot ${createdAccountId}:`, cleanupError)
      }
    }

    console.error(`[Clients] Erro ao provisionar Chatwoot para ${clientId}:`, err)
    throw err
  }
}
