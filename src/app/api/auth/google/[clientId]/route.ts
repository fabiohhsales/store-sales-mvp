// GET /api/auth/google/[clientId]
// Inicia o fluxo OAuth2 do Google para conectar a conta Google de um cliente específico.
// O clientId é passado como state para recuperar no callback.

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params

  // Somente admins podem iniciar o fluxo OAuth de um cliente
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  const redirectUri = `${appUrl}/api/auth/google/callback`

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: clientId,
    prompt: 'consent', // força geração de refresh_token
  })

  return NextResponse.redirect(authUrl)
}
