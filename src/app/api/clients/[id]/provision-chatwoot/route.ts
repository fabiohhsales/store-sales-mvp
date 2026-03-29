import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createChatwootAccount,
  configureChatwootWebhook,
  ensureChatwootLabels,
  createChatwootAgent,
} from '@/lib/api/chatwoot'
import { getPanelWebhookUrl } from '@/lib/api/evolution'
import { DEFAULT_STAGE_LABELS } from '@/lib/bot/stage-labels'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { ChatwootAgentInput } from '@/types/api'
import type { ProvisionedChatwootAgent } from '@/types/database'

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

    const { data: clientRow, error: clientError } = await admin
      .from('panel_clients')
      .select('id, name, owner_name, email, provisioned_agents, chatwoot_email, chatwoot_account_id, chatwoot_agent_token')
      .eq('id', clientId)
      .single()

    if (clientError || !clientRow) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
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
    const tempInstanceName = `client-${clientId.slice(0, 8)}`

    const account = await withRetry(() =>
      createChatwootAccount(clientRow.name, clientRow.email, clientRow.owner_name, tempInstanceName)
    )

    await withRetry(() =>
      configureChatwootWebhook(account.id, account.access_token, getPanelWebhookUrl())
    )

    try {
      await ensureChatwootLabels(account.id, account.access_token, DEFAULT_STAGE_LABELS)
    } catch (err) {
      console.warn('[ProvisionChatwoot] Sync de etiquetas falhou (não-crítico):', err)
    }

    const agentsSummary = {
      created: [] as string[],
      existing: [] as string[],
      failed: [] as Array<{ email: string; reason: string }>,
    }

    for (const agent of parsed.agents) {
      try {
        const input: ChatwootAgentInput = {
          name: agent.name,
          email: agent.email,
          role: agent.role,
        }
        const result = await createChatwootAgent(account.id, account.access_token, input)
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

    const { error: updateClientError } = await admin
      .from('panel_clients')
      .update({
        chatwoot_account_id: account.id,
        chatwoot_agent_token: account.access_token,
        chatwoot_email: account.login_email ?? clientRow.chatwoot_email ?? clientRow.email,
      })
      .eq('id', clientId)

    if (updateClientError) {
      throw new Error(`Falha ao atualizar panel_clients: ${updateClientError.message}`)
    }

    let copiedToWhatsappConfig = false
    const { data: wConfig } = await admin
      .from('panel_whatsapp_config')
      .select('chatwoot_account_id, chatwoot_agent_token, chatwoot_email')
      .eq('client_id', clientId)
      .maybeSingle()

    if (wConfig && (!wConfig.chatwoot_account_id || !wConfig.chatwoot_agent_token || !wConfig.chatwoot_email)) {
      const { error: wUpdateError } = await admin
        .from('panel_whatsapp_config')
        .update({
          chatwoot_account_id: wConfig.chatwoot_account_id ?? account.id,
          chatwoot_agent_token: wConfig.chatwoot_agent_token ?? account.access_token,
          chatwoot_email: wConfig.chatwoot_email ?? account.login_email ?? clientRow.chatwoot_email ?? clientRow.email,
        })
        .eq('client_id', clientId)

      if (!wUpdateError) copiedToWhatsappConfig = true
    }

    await insertAuditLog({
      admin_email: user.email!,
      action: 'chatwoot_provisioned_manual',
      client_id: clientId,
      details: {
        account_id: account.id,
        copied_to_whatsapp_config: copiedToWhatsappConfig,
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
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
