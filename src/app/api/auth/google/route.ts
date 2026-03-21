import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/api/google'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')

    if (!clientId) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: client_id' },
        { status: 400 }
      )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`

    // State codificado em base64 com client_id
    const state = Buffer.from(JSON.stringify({ client_id: clientId })).toString('base64')

    const url = getAuthUrl(redirectUri, state)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Erro ao iniciar OAuth Google:', error)
    return NextResponse.json(
      { error: 'Erro interno ao iniciar autenticação Google' },
      { status: 500 }
    )
  }
}
