import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientById } from '@/lib/db/clients'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
const CHATWOOT_URL = process.env.CHATWOOT_URL?.replace(/\/$/, '') ?? ''

// ── Chatwoot Dashboard Apps helpers ───────────────────────────────────────────

async function listChatwootDashboardApps(
  accountId: number,
  agentToken: string
): Promise<Array<{ id: number; title: string }>> {
  try {
    const res = await fetch(
      `${CHATWOOT_URL}/api/v1/accounts/${accountId}/dashboard_apps`,
      { headers: { api_access_token: agentToken } }
    )
    if (!res.ok) return []
    const data = await res.json()
    // Chatwoot returns { payload: [...] } or directly an array
    return Array.isArray(data) ? data : (data?.payload ?? [])
  } catch {
    return []
  }
}

async function deleteChatwootDashboardApp(
  accountId: number,
  agentToken: string,
  appId: number
): Promise<void> {
  await fetch(`${CHATWOOT_URL}/api/v1/accounts/${accountId}/dashboard_apps/${appId}`, {
    method: 'DELETE',
    headers: { api_access_token: agentToken },
  }).catch(() => {})
}

async function createChatwootDashboardApp(
  accountId: number,
  agentToken: string,
  title: string,
  url: string
): Promise<{ id: number } | null> {
  const res = await fetch(
    `${CHATWOOT_URL}/api/v1/accounts/${accountId}/dashboard_apps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: agentToken,
      },
      body: JSON.stringify({
        title,
        content: [{ type: 'frame', url }],
      }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  // Chatwoot may wrap in { payload: {...} }
  return data?.payload ?? data
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const client = await getClientById(id)

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    // Fallback: prefer panel_whatsapp_config, then panel_clients directly
    const chatwoot_account_id =
      client.panel_whatsapp_config?.chatwoot_account_id ?? client.chatwoot_account_id
    const chatwoot_agent_token =
      client.panel_whatsapp_config?.chatwoot_agent_token ?? client.chatwoot_agent_token

    if (!chatwoot_account_id || !chatwoot_agent_token) {
      return NextResponse.json(
        { error: 'Chatwoot não provisionado para este cliente' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // ── 1. Remover Dashboard Apps antigos no Chatwoot ────────────────────────
    // Evita proliferação de "Pipeline (2)", "Pipeline (3)" na sidebar do agente
    const existingApps = await listChatwootDashboardApps(chatwoot_account_id, chatwoot_agent_token)
    const appsToDelete = existingApps.filter((a) =>
      a.title === 'Pipeline' || a.title === 'Agenda'
    )
    await Promise.all(
      appsToDelete.map((a) =>
        deleteChatwootDashboardApp(chatwoot_account_id, chatwoot_agent_token, a.id)
      )
    )

    // ── 2. Remover tokens embed antigos do cliente ───────────────────────────
    // Evita acumulação de tokens órfãos ao re-executar o setup
    await admin
      .from('panel_embed_tokens')
      .delete()
      .eq('client_id', id)
      .in('label', ['Pipeline (Chatwoot)', 'Agenda (Chatwoot)'])

    // ── 3. Criar novos tokens embed ──────────────────────────────────────────
    const { data: kanbanToken, error: errKanban } = await admin
      .from('panel_embed_tokens')
      .insert({
        user_id: user.id,
        client_id: id,
        label: 'Pipeline (Chatwoot)',
      })
      .select('token')
      .single()

    if (errKanban || !kanbanToken) {
      return NextResponse.json({ error: 'Erro ao criar token do kanban' }, { status: 500 })
    }

    const { data: agendaToken, error: errAgenda } = await admin
      .from('panel_embed_tokens')
      .insert({
        user_id: user.id,
        client_id: id,
        label: 'Agenda (Chatwoot)',
      })
      .select('token')
      .single()

    if (errAgenda || !agendaToken) {
      return NextResponse.json({ error: 'Erro ao criar token da agenda' }, { status: 500 })
    }

    // ── 4. Criar novos Dashboard Apps no Chatwoot ────────────────────────────
    const kanbanUrl = `${APP_URL}/chatwoot/kanban?token=${kanbanToken.token}`
    const agendaUrl = `${APP_URL}/chatwoot/agenda?token=${agendaToken.token}`

    const [kanbanApp, agendaApp] = await Promise.all([
      createChatwootDashboardApp(chatwoot_account_id, chatwoot_agent_token, 'Pipeline', kanbanUrl),
      createChatwootDashboardApp(chatwoot_account_id, chatwoot_agent_token, 'Agenda', agendaUrl),
    ])

    return NextResponse.json({
      kanban: { token: kanbanToken.token, url: kanbanUrl, chatwoot_app_id: kanbanApp?.id ?? null },
      agenda: { token: agendaToken.token, url: agendaUrl, chatwoot_app_id: agendaApp?.id ?? null },
    })
  } catch (error) {
    console.error('Erro ao configurar Dashboard Apps:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
