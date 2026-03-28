import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createChatwootAgent } from '@/lib/api/chatwoot'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { ChatwootAgentInput, ChatwootAgentRole } from '@/types/api'
import type { ProvisionedChatwootAgent } from '@/types/database'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const VALID_ROLES: ChatwootAgentRole[] = ['agent', 'administrator']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id: clientId } = await params
    const body = await request.json()
    const rawAgents: unknown[] = Array.isArray(body.agents) ? body.agents : []

    // Validação dos agentes
    const agents: ProvisionedChatwootAgent[] = []
    for (const raw of rawAgents) {
      const a = raw as Record<string, unknown>
      const name = typeof a.name === 'string' ? a.name.trim() : ''
      const email = typeof a.email === 'string' ? a.email.trim().toLowerCase() : ''
      const role = typeof a.role === 'string' ? a.role : ''

      if (!name || !email) {
        return NextResponse.json({ error: 'Cada agente precisa de nome e e-mail' }, { status: 400 })
      }
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: `E-mail inválido: ${email}` }, { status: 400 })
      }
      if (!VALID_ROLES.includes(role as ChatwootAgentRole)) {
        return NextResponse.json({ error: `Papel inválido: ${role}` }, { status: 400 })
      }

      agents.push({ name, email, role: role as ChatwootAgentRole })
    }

    // Verifica e-mails duplicados
    const emails = agents.map((a) => a.email)
    if (new Set(emails).size !== emails.length) {
      return NextResponse.json({ error: 'E-mails duplicados na lista de agentes' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Busca cliente + whatsapp config para obter credenciais Chatwoot
    const { data: clientRow } = await admin
      .from('panel_clients')
      .select('chatwoot_account_id, chatwoot_agent_token')
      .eq('id', clientId)
      .single()

    const { data: wConfig } = await admin
      .from('panel_whatsapp_config')
      .select('chatwoot_account_id, chatwoot_agent_token')
      .eq('client_id', clientId)
      .maybeSingle()

    // Credenciais: panel_clients tem prioridade (migration 008), fallback para panel_whatsapp_config
    const accountId = clientRow?.chatwoot_account_id ?? wConfig?.chatwoot_account_id ?? null
    const accountToken = clientRow?.chatwoot_agent_token ?? wConfig?.chatwoot_agent_token ?? null

    // Salva provisioned_agents no banco
    const { error: updateError } = await admin
      .from('panel_clients')
      .update({ provisioned_agents: agents })
      .eq('id', clientId)

    if (updateError) {
      throw new Error(`Erro ao salvar agentes: ${updateError.message}`)
    }

    const agentsSummary = {
      created: [] as string[],
      existing: [] as string[],
      failed: [] as Array<{ email: string; reason: string }>,
    }

    // Provisiona no Chatwoot imediatamente se credenciais disponíveis
    if (accountId && accountToken && agents.length > 0) {
      for (const agent of agents) {
        try {
          const input: ChatwootAgentInput = { name: agent.name, email: agent.email, role: agent.role }
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
    }

    await insertAuditLog({
      admin_email: user.email!,
      action: 'agents_updated',
      client_id: clientId,
      details: {
        total: agents.length,
        provisioned_to_chatwoot: accountId !== null,
        agents_summary: {
          created: agentsSummary.created.length,
          existing: agentsSummary.existing.length,
          failed: agentsSummary.failed.length,
        },
      },
    })

    return NextResponse.json({
      saved: true,
      chatwoot_provisioned: accountId !== null,
      agents_summary: agentsSummary,
    })
  } catch (error) {
    console.error('Erro ao salvar agentes:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
