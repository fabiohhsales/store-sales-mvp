import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientById } from '@/lib/db/clients'

function normalizeAbsoluteUrl(rawUrl: string | null | undefined, label: string): string | null {
  const trimmed = rawUrl?.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${label} inválida: ${trimmed}`)
  }
}

function getChatwootBaseUrl(): string {
  const chatwootUrl = normalizeAbsoluteUrl(process.env.CHATWOOT_URL, 'CHATWOOT_URL')
  if (!chatwootUrl) {
    throw new Error('CHATWOOT_URL não configurada')
  }
  return chatwootUrl
}

function getPublicAppUrl(request: NextRequest): string {
  return normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL, 'NEXT_PUBLIC_APP_URL')
    ?? request.nextUrl.origin.replace(/\/$/, '')
}

async function getResponseError(res: Response): Promise<string> {
  const body = await res.text()

  if (!body) {
    return `${res.status} ${res.statusText}`.trim()
  }

  try {
    const data = JSON.parse(body) as {
      error?: string
      message?: string
      errors?: string[] | Record<string, string[]>
    }

    if (typeof data.error === 'string' && data.error.trim()) {
      return `${res.status} ${data.error}`
    }

    if (typeof data.message === 'string' && data.message.trim()) {
      return `${res.status} ${data.message}`
    }

    if (Array.isArray(data.errors) && data.errors.length > 0) {
      return `${res.status} ${data.errors.join(', ')}`
    }

    if (data.errors && typeof data.errors === 'object') {
      const messages = Object.values(data.errors).flat().filter(Boolean)
      if (messages.length > 0) {
        return `${res.status} ${messages.join(', ')}`
      }
    }
  } catch {
    // Keep raw body below.
  }

  return `${res.status} ${body}`
}

// ── Chatwoot Dashboard Apps helpers ───────────────────────────────────────────

async function listChatwootDashboardApps(
  chatwootBaseUrl: string,
  accountId: number,
  agentToken: string
): Promise<Array<{ id: number; title: string }>> {
  try {
    const res = await fetch(
      `${chatwootBaseUrl}/api/v1/accounts/${accountId}/dashboard_apps`,
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
  chatwootBaseUrl: string,
  accountId: number,
  agentToken: string,
  appId: number
): Promise<void> {
  await fetch(`${chatwootBaseUrl}/api/v1/accounts/${accountId}/dashboard_apps/${appId}`, {
    method: 'DELETE',
    headers: { api_access_token: agentToken },
  }).catch(() => {})
}

async function createChatwootDashboardApp(
  chatwootBaseUrl: string,
  accountId: number,
  agentToken: string,
  title: string,
  url: string
) : Promise<{ id: number }> {
  const res = await fetch(
    `${chatwootBaseUrl}/api/v1/accounts/${accountId}/dashboard_apps`,
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

  if (!res.ok) {
    throw new Error(`Erro ao criar Dashboard App "${title}": ${await getResponseError(res)}`)
  }

  const data = await res.json()
  // Chatwoot may wrap in { payload: {...} }
  const payload = data?.payload ?? data

  if (typeof payload?.id !== 'number') {
    throw new Error(`Chatwoot não retornou id ao criar Dashboard App "${title}"`)
  }

  return payload
}

export async function POST(
  request: NextRequest,
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

    const chatwootBaseUrl = getChatwootBaseUrl()
    const appBaseUrl = getPublicAppUrl(request)
    const admin = createAdminClient()

    // ── 1. Remover Dashboard Apps antigos no Chatwoot ────────────────────────
    // Evita proliferação de "Pipeline (2)", "Pipeline (3)" na sidebar do agente
    const existingApps = await listChatwootDashboardApps(chatwootBaseUrl, chatwoot_account_id, chatwoot_agent_token)
    const appsToDelete = existingApps.filter((a) =>
      a.title === 'Pipeline' || a.title === 'Agenda'
    )
    await Promise.all(
      appsToDelete.map((a) =>
        deleteChatwootDashboardApp(chatwootBaseUrl, chatwoot_account_id, chatwoot_agent_token, a.id)
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
    const kanbanUrl = `${appBaseUrl}/chatwoot/kanban?token=${kanbanToken.token}`
    const agendaUrl = `${appBaseUrl}/chatwoot/agenda?token=${agendaToken.token}`

    let kanbanAppId: number | null = null

    try {
      const kanbanApp = await createChatwootDashboardApp(
        chatwootBaseUrl,
        chatwoot_account_id,
        chatwoot_agent_token,
        'Pipeline',
        kanbanUrl
      )
      kanbanAppId = kanbanApp.id

      const agendaApp = await createChatwootDashboardApp(
        chatwootBaseUrl,
        chatwoot_account_id,
        chatwoot_agent_token,
        'Agenda',
        agendaUrl
      )

      return NextResponse.json({
        kanban: { token: kanbanToken.token, url: kanbanUrl, chatwoot_app_id: kanbanApp.id },
        agenda: { token: agendaToken.token, url: agendaUrl, chatwoot_app_id: agendaApp.id },
      })
    } catch (error) {
      await admin
        .from('panel_embed_tokens')
        .delete()
        .in('token', [kanbanToken.token, agendaToken.token])

      if (kanbanAppId != null) {
        await deleteChatwootDashboardApp(
          chatwootBaseUrl,
          chatwoot_account_id,
          chatwoot_agent_token,
          kanbanAppId
        )
      }

      const message = error instanceof Error ? error.message : 'Erro ao criar Dashboard Apps no Chatwoot'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (error) {
    console.error('Erro ao configurar Dashboard Apps:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
