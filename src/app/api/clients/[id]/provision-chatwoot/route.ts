import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createChatwootAccount,
  configureChatwootWebhook,
  ensureChatwootLabels,
  createChatwootAgent,
  deleteChatwootAccount,
} from '@/lib/api/chatwoot'
import { getPanelWebhookUrl } from '@/lib/api/evolution'
import { DEFAULT_STAGE_LABELS } from '@/lib/bot/stage-labels'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { ChatwootAgentInput } from '@/types/api'
import type { ProvisionedChatwootAgent } from '@/types/database'

type AdminClient = ReturnType<typeof createAdminClient>

interface ChatwootCredentials {
  accountId: number
  agentToken: string
  loginEmail: string | null
}

interface AgentsSummary {
  created: string[]
  existing: string[]
  failed: Array<{ email: string; reason: string }>
}

function normalizeAbsoluteUrl(rawUrl: string | null | undefined, label: string): string {
  const trimmed = rawUrl?.trim()
  if (!trimmed) {
    throw new Error(`${label} não configurada`)
  }

  try {
    return new URL(trimmed).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${label} inválida: ${trimmed}`)
  }
}

function getChatwootBaseUrl(): string {
  return normalizeAbsoluteUrl(process.env.CHATWOOT_URL, 'CHATWOOT_URL')
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function parseProvisionedAgents(input: unknown): { agents: ProvisionedChatwootAgent[]; ignored: number } {
  if (!Array.isArray(input)) return { agents: [], ignored: 0 }

  let ignored = 0
  const agents = input
    .map((item) => {
      const record = item as Record<string, unknown>
      const name = typeof record?.name === 'string' ? record.name.trim() : ''
      const email = typeof record?.email === 'string' ? record.email.trim().toLowerCase() : ''
      const role = record?.role === 'administrator' ? 'administrator' : 'agent'

      if (!name || !email || !isValidEmail(email)) {
        ignored += 1
        return null
      }

      return { name, email, role } satisfies ProvisionedChatwootAgent
    })
    .filter((item): item is ProvisionedChatwootAgent => item !== null)

  const unique = new Map<string, ProvisionedChatwootAgent>()
  for (const agent of agents) unique.set(agent.email, agent)

  return {
    agents: Array.from(unique.values()),
    ignored,
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

async function validateLegacyChatwootCredentials(
  accountId: number,
  agentToken: string
): Promise<'valid' | 'invalid'> {
  const res = await fetch(`${getChatwootBaseUrl()}/api/v1/accounts/${accountId}/inboxes`, {
    headers: { api_access_token: agentToken },
  })

  if (res.ok) {
    return 'valid'
  }

  if ([401, 403, 404].includes(res.status)) {
    return 'invalid'
  }

  const body = await res.text()
  throw new Error(`Falha ao validar credenciais Chatwoot legadas: ${res.status} ${body}`.trim())
}

async function updateClientChatwootCredentials(
  admin: AdminClient,
  clientId: string,
  credentials: ChatwootCredentials
): Promise<void> {
  const { error } = await admin
    .from('panel_clients')
    .update({
      chatwoot_account_id: credentials.accountId,
      chatwoot_agent_token: credentials.agentToken,
      chatwoot_email: credentials.loginEmail,
    })
    .eq('id', clientId)

  if (error) {
    throw new Error(`Falha ao atualizar panel_clients: ${error.message}`)
  }
}

async function copyChatwootCredentialsToWhatsappConfig(
  admin: AdminClient,
  clientId: string,
  credentials: ChatwootCredentials
): Promise<boolean> {
  const { data: wConfig, error } = await admin
    .from('panel_whatsapp_config')
    .select('chatwoot_account_id, chatwoot_agent_token, chatwoot_email')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) {
    console.warn('[ProvisionChatwoot] Falha ao consultar panel_whatsapp_config:', error)
    return false
  }

  if (!wConfig) {
    return false
  }

  if (
    wConfig.chatwoot_account_id === credentials.accountId &&
    wConfig.chatwoot_agent_token === credentials.agentToken &&
    wConfig.chatwoot_email === credentials.loginEmail
  ) {
    return false
  }

  const { error: updateError } = await admin
    .from('panel_whatsapp_config')
    .update({
      chatwoot_account_id: credentials.accountId,
      chatwoot_agent_token: credentials.agentToken,
      chatwoot_email: credentials.loginEmail,
    })
    .eq('client_id', clientId)

  if (updateError) {
    console.warn('[ProvisionChatwoot] Falha ao copiar credenciais para panel_whatsapp_config:', updateError)
    return false
  }

  return true
}

async function syncChatwootLabelsAndAgents(
  accountId: number,
  accountToken: string,
  agents: ProvisionedChatwootAgent[]
): Promise<AgentsSummary> {
  try {
    await ensureChatwootLabels(accountId, accountToken, DEFAULT_STAGE_LABELS)
  } catch (err) {
    console.warn('[ProvisionChatwoot] Sync de etiquetas falhou (não-crítico):', err)
  }

  const agentsSummary: AgentsSummary = {
    created: [],
    existing: [],
    failed: [],
  }

  for (const agent of agents) {
    try {
      const input: ChatwootAgentInput = {
        name: agent.name,
        email: agent.email,
        role: agent.role,
      }
      const result = await createChatwootAgent(accountId, accountToken, input)
      if (result.status === 'exists') {
        agentsSummary.existing.push(agent.email)
      } else {
        agentsSummary.created.push(agent.email)
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Erro desconhecido'
      agentsSummary.failed.push({ email: agent.email, reason })
    }
  }

  return agentsSummary
}

async function insertAuditLogSafely(payload: Parameters<typeof insertAuditLog>[0]): Promise<void> {
  try {
    await insertAuditLog(payload)
  } catch (err) {
    console.warn('[ProvisionChatwoot] Falha ao registrar auditoria:', err)
  }
}

async function rollbackCreatedChatwootAccount(
  userEmail: string,
  clientId: string,
  accountId: number,
  accountToken: string,
  cause: string
): Promise<{ orphanedAccountId: number | null; requiresManualCleanup: boolean }> {
  const cleanup = await deleteChatwootAccount(accountId, accountToken)

  if (!cleanup.deleted) {
    await insertAuditLogSafely({
      admin_email: userEmail,
      action: 'chatwoot_rollback_failed',
      client_id: clientId,
      details: {
        account_id: accountId,
        cause,
        cleanup_error: cleanup.error ?? null,
      },
    })

    return {
      orphanedAccountId: accountId,
      requiresManualCleanup: true,
    }
  }

  await insertAuditLogSafely({
    admin_email: userEmail,
    action: 'chatwoot_rollback',
    client_id: clientId,
    details: {
      account_id: accountId,
      cause,
    },
  })

  return {
    orphanedAccountId: null,
    requiresManualCleanup: false,
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id: clientId } = await params
    const admin = createAdminClient()

    const [{ data: clientRow, error: clientError }, { data: wConfig, error: wConfigError }] = await Promise.all([
      admin
        .from('panel_clients')
        .select('id, name, owner_name, email, provisioned_agents, chatwoot_email, chatwoot_account_id, chatwoot_agent_token')
        .eq('id', clientId)
        .single(),
      admin
        .from('panel_whatsapp_config')
        .select('chatwoot_account_id, chatwoot_agent_token, chatwoot_email')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    if (clientError || !clientRow) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    if (wConfigError) {
      console.warn('[ProvisionChatwoot] Falha ao consultar panel_whatsapp_config:', wConfigError)
    }

    if (clientRow.chatwoot_account_id && clientRow.chatwoot_agent_token) {
      return NextResponse.json({
        provisioned: false,
        already_provisioned: true,
        account_id: clientRow.chatwoot_account_id,
        token_configured: true,
        copied_to_whatsapp_config: false,
        agents_summary: { created: [], existing: [], failed: [] },
        ignored_agents: 0,
        message: 'Cliente já possui credenciais Chatwoot em panel_clients',
      })
    }

    const parsed = parseProvisionedAgents(clientRow.provisioned_agents)
    const legacyCredentials = wConfig?.chatwoot_account_id && wConfig?.chatwoot_agent_token
      ? {
          accountId: wConfig.chatwoot_account_id,
          agentToken: wConfig.chatwoot_agent_token,
          loginEmail: wConfig.chatwoot_email ?? clientRow.chatwoot_email ?? clientRow.email,
        } satisfies ChatwootCredentials
      : null

    if (legacyCredentials) {
      const legacyStatus = await validateLegacyChatwootCredentials(
        legacyCredentials.accountId,
        legacyCredentials.agentToken
      )

      if (legacyStatus === 'valid') {
        await updateClientChatwootCredentials(admin, clientId, legacyCredentials)

        const agentsSummary = await syncChatwootLabelsAndAgents(
          legacyCredentials.accountId,
          legacyCredentials.agentToken,
          parsed.agents
        )

        await insertAuditLogSafely({
          admin_email: user.email!,
          action: 'chatwoot_backfilled_manual',
          client_id: clientId,
          details: {
            account_id: legacyCredentials.accountId,
            ignored_agents: parsed.ignored,
            agents_summary: {
              created: agentsSummary.created.length,
              existing: agentsSummary.existing.length,
              failed: agentsSummary.failed.length,
            },
          },
        })

        return NextResponse.json({
          provisioned: true,
          already_provisioned: false,
          backfilled: true,
          reused_legacy: true,
          account_id: legacyCredentials.accountId,
          token_configured: true,
          copied_to_whatsapp_config: false,
          agents_summary: agentsSummary,
          ignored_agents: parsed.ignored,
          message: 'Credenciais Chatwoot legadas reaproveitadas com sucesso',
        })
      }
    }

    const tempInstanceName = `client-${clientId.slice(0, 8)}`
    let createdAccountId: number | null = null
    let createdAccountToken: string | null = null

    try {
      const account = await withRetry(() =>
        createChatwootAccount(clientRow.name, clientRow.email, clientRow.owner_name, tempInstanceName)
      )
      createdAccountId = account.id
      createdAccountToken = account.access_token

      await withRetry(() =>
        configureChatwootWebhook(account.id, account.access_token, getPanelWebhookUrl())
      )

      const credentials: ChatwootCredentials = {
        accountId: account.id,
        agentToken: account.access_token,
        loginEmail: account.login_email ?? clientRow.chatwoot_email ?? clientRow.email,
      }

      await updateClientChatwootCredentials(admin, clientId, credentials)

      const agentsSummary = await syncChatwootLabelsAndAgents(
        account.id,
        account.access_token,
        parsed.agents
      )

      const copiedToWhatsappConfig = await copyChatwootCredentialsToWhatsappConfig(
        admin,
        clientId,
        credentials
      )

      await insertAuditLogSafely({
        admin_email: user.email!,
        action: 'chatwoot_provisioned_manual',
        client_id: clientId,
        details: {
          account_id: account.id,
          copied_to_whatsapp_config: copiedToWhatsappConfig,
          ignored_agents: parsed.ignored,
          fallback_from_legacy: legacyCredentials != null,
          agents_summary: {
            created: agentsSummary.created.length,
            existing: agentsSummary.existing.length,
            failed: agentsSummary.failed.length,
          },
        },
      })

      return NextResponse.json({
        provisioned: true,
        already_provisioned: false,
        backfilled: false,
        reused_legacy: false,
        fallback_from_legacy: legacyCredentials != null,
        account_id: account.id,
        token_configured: true,
        copied_to_whatsapp_config: copiedToWhatsappConfig,
        agents_summary: agentsSummary,
        ignored_agents: parsed.ignored,
        message: 'Chatwoot provisionado com sucesso para cliente existente',
      })
    } catch (error) {
      console.error('Erro ao provisionar Chatwoot manualmente:', error)
      const message = error instanceof Error ? error.message : 'Erro interno'

      if (createdAccountId && createdAccountToken) {
        const rollback = await rollbackCreatedChatwootAccount(
          user.email!,
          clientId,
          createdAccountId,
          createdAccountToken,
          message
        )

        return NextResponse.json(
          {
            error: message,
            ...(rollback.orphanedAccountId != null
              ? {
                  orphaned_account_id: rollback.orphanedAccountId,
                  requires_manual_cleanup: rollback.requiresManualCleanup,
                }
              : {}),
          },
          { status: 500 }
        )
      }

      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (error) {
    console.error('Erro ao provisionar Chatwoot manualmente:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
