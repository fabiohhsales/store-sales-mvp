import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, listCalendars } from '@/lib/api/google'
import { upsertGoogleConfig } from '@/lib/db/google-config'
import { updateClient } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { PanelGoogleConfigInsert } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const stateParam = searchParams.get('state')
    const errorParam = searchParams.get('error')

    // Decodifica state pra saber se é fluxo público ou admin
    let state: { client_id?: string; source?: string; instance_name?: string } = {}
    if (stateParam) {
      try {
        state = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'))
      } catch {
        return NextResponse.json({ error: 'State inválido' }, { status: 400 })
      }
    }

    const isPublic = state.source === 'public'
    const clientId = state.client_id
    const instanceName = state.instance_name

    // Erro do Google
    if (errorParam) {
      if (isPublic && instanceName) {
        const redirectUrl = new URL(`/connect/${instanceName}`, request.url)
        redirectUrl.searchParams.set('google', 'error')
        redirectUrl.searchParams.set('error_detail', errorParam)
        return NextResponse.redirect(redirectUrl)
      }
      const redirectUrl = new URL('/clients/new', request.url)
      redirectUrl.searchParams.set('google', 'error')
      redirectUrl.searchParams.set('error_detail', errorParam)
      return NextResponse.redirect(redirectUrl)
    }

    if (!code || !stateParam || !clientId) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: code, state com client_id' },
        { status: 400 }
      )
    }

    // Se não é público, valida auth do admin
    if (!isPublic) {
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`

    // Troca o code por tokens
    const tokens = await exchangeCode(code, redirectUri)

    // Busca lista de calendários
    const calendars = await listCalendars(tokens.access_token)

    // Usa o calendário primário por padrão
    const primaryCalendar = calendars.find((c) => c.primary)
    const calendarId = primaryCalendar?.id || calendars[0]?.id || null
    const googleEmail = primaryCalendar?.id || null

    // Calcula expiração do token
    const tokenExpiry = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    // Salva no banco (upsert pra caso já exista)
    const googleConfig: PanelGoogleConfigInsert = {
      client_id: clientId,
      google_email: googleEmail,
      calendar_id: calendarId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expiry: tokenExpiry,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      authorized_at: new Date().toISOString(),
    }

    await upsertGoogleConfig(googleConfig)

    // Atualiza status do cliente
    await updateClient(clientId, { status: 'configuring' })

    // Log de auditoria
    await insertAuditLog({
      admin_email: isPublic ? 'public-onboarding' : 'admin',
      action: 'google_calendar_connected',
      client_id: clientId,
      details: {
        google_email: googleEmail,
        calendar_id: calendarId,
        calendars_available: calendars.length,
        source: isPublic ? 'public' : 'admin',
      },
    })

    // Redireciona de volta
    if (isPublic) {
      // Popup: redireciona pra página que envia postMessage e fecha
      const redirectUrl = new URL('/connect/oauth-complete', request.url)
      redirectUrl.searchParams.set('status', 'success')
      return NextResponse.redirect(redirectUrl)
    }

    const redirectUrl = new URL('/clients/new', request.url)
    redirectUrl.searchParams.set('client_id', clientId)
    redirectUrl.searchParams.set('step', '3')
    redirectUrl.searchParams.set('google', 'success')
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('Erro no callback Google OAuth:', error)

    // Tenta detectar se era fluxo público pelo state
    const { searchParams } = new URL(request.url)
    const stateParam = searchParams.get('state')
    if (stateParam) {
      try {
        const state = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'))
        if (state.source === 'public') {
          const redirectUrl = new URL('/connect/oauth-complete', request.url)
          redirectUrl.searchParams.set('status', 'error')
          return NextResponse.redirect(redirectUrl)
        }
      } catch { /* ignore */ }
    }

    const redirectUrl = new URL('/clients/new', request.url)
    redirectUrl.searchParams.set('google', 'error')
    return NextResponse.redirect(redirectUrl)
  }
}
