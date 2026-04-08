// @deprecated — usar apenas para clientes com account_id legado
// Pipeline ativo: Evolution API direta via /api/webhooks/evolution
// Data-alvo de remoção: após 100% dos clientes migrarem para Evolution

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientById } from '@/lib/db/clients'

type AdminClient = ReturnType<typeof createAdminClient>
type ChatwootDashboardApp = { id: number; title: string }
type EmbedTokenRow = { token: string; label: string }

const EMBED_LABELS = ['Pipeline (Chatwoot)', 'Agenda (Chatwoot)'] as const

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
): Promise<ChatwootDashboardApp[]> {
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

async function listExistingEmbedTokens(
  admin: AdminClient,
  clientId: string
): Promise<EmbedTokenRow[]> {
  const { data, error } = await admin
    .from('panel_embed_tokens')
    .select('token, label')
    .eq('client_id', clientId)
    .in('label', Array.from(EMBED_LABELS))

  if (error) {
    throw new Error(`Erro ao listar tokens embed existentes: ${error.message}`)
  }

  return (data ?? []) as EmbedTokenRow[]
}

async function createEmbedToken(
  admin: AdminClient,
  userId: string,
  clientId: string,
  label: (typeof EMBED_LABELS)[number]
): Promise<string> {
  const { data, error } = await admin
    .from('panel_embed_tokens')
    .insert({
      user_id: userId,
      client_id: clientId,
      label,
    })
    .select('token')
    .single()

  const tokenRow = data as { token?: string } | null
  if (error || !tokenRow?.token) {
    const target = label === 'Pipeline (Chatwoot)' ? 'kanban' : 'agenda'
    throw new Error(`Erro ao criar token do ${target}`)
  }

  return tokenRow.token
}

async function deleteEmbedTokens(admin: AdminClient, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return

  const { error } = await admin
    .from('panel_embed_tokens')
    .delete()
    .in('token', tokens)

  if (error) {
    throw new Error(`Erro ao limpar tokens embed: ${error.message}`)
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
    const existingApps = (await listChatwootDashboardApps(
      chatwootBaseUrl,
      chatwoot_account_id,
      chatwoot_agent_token
    )).filter((app) => app.title === 'Pipeline' || app.title === 'Agenda')
    const existingTokens = await listExistingEmbedTokens(admin, id)

    let kanbanToken: string | null = null
    let agendaToken: string | null = null

    try {
      kanbanToken = await createEmbedToken(admin, user.id, id, 'Pipeline (Chatwoot)')
      agendaToken = await createEmbedToken(admin, user.id, id, 'Agenda (Chatwoot)')
    } catch (error) {
      const createdTokens = [kanbanToken].filter((value): value is string => value != null)

      try {
        await deleteEmbedTokens(admin, createdTokens)
      } catch (cleanupError) {
        console.warn('[SetupChatwootApps] Falha ao limpar tokens recém-criados:', cleanupError)
      }

      const message = error instanceof Error ? error.message : 'Erro ao criar tokens embed'
      return NextResponse.json({ error: message }, { status: 500 })
    }

    // ── 1. Criar novos Dashboard Apps sem derrubar o setup atual ─────────────
    const kanbanUrl = `${appBaseUrl}/chatwoot/kanban?token=${kanbanToken}`
    const agendaUrl = `${appBaseUrl}/chatwoot/agenda?token=${agendaToken}`

    let kanbanAppId: number | null = null
    let agendaAppId: number | null = null

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
      agendaAppId = agendaApp.id

      // ── 2. Cutover concluído: agora sim limpamos recursos antigos ─────────
      const warnings: string[] = []

      const oldAppCleanup = await Promise.allSettled(
        existingApps.map((app) =>
          deleteChatwootDashboardApp(
            chatwootBaseUrl,
            chatwoot_account_id,
            chatwoot_agent_token,
            app.id
          )
        )
      )

      const hasOldAppCleanupFailures = oldAppCleanup.some((result) => result.status === 'rejected')

      oldAppCleanup.forEach((result, index) => {
        if (result.status === 'rejected') {
          warnings.push(`Falha ao remover Dashboard App antigo #${existingApps[index].id}`)
        }
      })

      if (!hasOldAppCleanupFailures) {
        try {
          await deleteEmbedTokens(admin, existingTokens.map((token) => token.token))
        } catch (cleanupError) {
          console.warn('[SetupChatwootApps] Falha ao limpar tokens antigos:', cleanupError)
          warnings.push('Falha ao remover tokens antigos de embed')
        }
      } else if (existingTokens.length > 0) {
        warnings.push('Tokens antigos foram preservados porque alguns Dashboard Apps antigos não puderam ser removidos')
      }

      return NextResponse.json({
        kanban: { token: kanbanToken, url: kanbanUrl, chatwoot_app_id: kanbanApp.id },
        agenda: { token: agendaToken, url: agendaUrl, chatwoot_app_id: agendaApp.id },
        ...(warnings.length > 0 ? { warnings } : {}),
      })
    } catch (error) {
      const cleanupApps = [kanbanAppId, agendaAppId].filter((value): value is number => value != null)
      const cleanupTokens = [kanbanToken, agendaToken].filter((value): value is string => value != null)

      const newAppCleanup = await Promise.allSettled(
        cleanupApps.map((appId) =>
          deleteChatwootDashboardApp(
            chatwootBaseUrl,
            chatwoot_account_id,
            chatwoot_agent_token,
            appId
          )
        )
      )

      newAppCleanup.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            `[SetupChatwootApps] Falha ao limpar novo Dashboard App #${cleanupApps[index]}:`,
            result.reason
          )
        }
      })

      try {
        await deleteEmbedTokens(admin, cleanupTokens)
      } catch (cleanupError) {
        console.warn('[SetupChatwootApps] Falha ao limpar tokens recém-criados:', cleanupError)
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
