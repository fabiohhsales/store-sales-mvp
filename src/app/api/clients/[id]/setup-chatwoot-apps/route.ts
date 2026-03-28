import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientById } from '@/lib/db/clients'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
const CHATWOOT_URL = process.env.CHATWOOT_URL?.replace(/\/$/, '') ?? ''

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
  return res.json()
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

    if (!client?.panel_whatsapp_config) {
      return NextResponse.json(
        { error: 'Cliente sem configuração WhatsApp' },
        { status: 400 }
      )
    }

    const { chatwoot_account_id, chatwoot_agent_token } =
      client.panel_whatsapp_config

    if (!chatwoot_account_id || !chatwoot_agent_token) {
      return NextResponse.json(
        { error: 'chatwoot_account_id ou chatwoot_agent_token não configurados' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Criar embed tokens para kanban e agenda
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

    // Criar Dashboard Apps no Chatwoot
    const kanbanUrl = `${APP_URL}/chatwoot/kanban?token=${kanbanToken.token}`
    const agendaUrl = `${APP_URL}/chatwoot/agenda?token=${agendaToken.token}`

    const [kanbanApp, agendaApp] = await Promise.all([
      createChatwootDashboardApp(
        chatwoot_account_id,
        chatwoot_agent_token,
        'Pipeline',
        kanbanUrl
      ),
      createChatwootDashboardApp(
        chatwoot_account_id,
        chatwoot_agent_token,
        'Agenda',
        agendaUrl
      ),
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
