// GET /api/auth/google/callback
// Recebe o code do Google OAuth, troca por tokens e persiste em panel_google_config.
// O clientId vem no parâmetro `state`.

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const clientId = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? origin
  const redirectUri = `${appUrl}/api/auth/google/callback`

  if (error || !code || !clientId) {
    console.error('[Google OAuth] Erro no callback:', error ?? 'code ou state ausente')
    return NextResponse.redirect(`${appUrl}/clients/${clientId ?? ''}?google_error=access_denied`)
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    )

    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      console.error('[Google OAuth] refresh_token não retornado — revogar acesso e tentar novamente')
      return NextResponse.redirect(`${appUrl}/clients/${clientId}?google_error=no_refresh_token`)
    }

    // Buscar email da conta conectada
    oauth2.setCredentials(tokens)
    const oauth2Info = google.oauth2({ version: 'v2', auth: oauth2 })
    const { data: userInfo } = await oauth2Info.userinfo.get()

    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('panel_google_config')
      .upsert(
        {
          client_id: clientId,
          google_email: userInfo.email ?? null,
          calendar_id: 'primary',
          access_token: tokens.access_token ?? null,
          refresh_token: tokens.refresh_token,
          token_expiry: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          scopes: tokens.scope?.split(' ') ?? [],
          authorized_at: new Date().toISOString(),
          calendar_mode: 'google_oauth',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id' }
      )

    if (upsertError) {
      console.error('[Google OAuth] Falha ao salvar tokens:', upsertError.message)
      return NextResponse.redirect(`${appUrl}/clients/${clientId}?google_error=save_failed`)
    }

    console.log(`[Google OAuth] Cliente ${clientId} conectou conta Google: ${userInfo.email}`)
    return NextResponse.redirect(`${appUrl}/clients/${clientId}?google_connected=1`)
  } catch (err) {
    console.error('[Google OAuth] Erro inesperado:', err)
    return NextResponse.redirect(`${appUrl}/clients/${clientId ?? ''}?google_error=unexpected`)
  }
}
