import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/api/google'
import { getWhatsAppConfigByInstanceName } from '@/lib/db/whatsapp-config'

// Rota PÚBLICA — inicia OAuth Google a partir do instanceName (sem auth)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceName = searchParams.get('instance_name')

    if (!instanceName) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: instance_name' },
        { status: 400 }
      )
    }

    // Busca o client_id pelo instanceName
    const config = await getWhatsAppConfigByInstanceName(instanceName)
    if (!config) {
      return NextResponse.json(
        { error: 'Instância não encontrada' },
        { status: 404 }
      )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`

    // State com source=public pra o callback saber pra onde redirecionar
    const state = Buffer.from(
      JSON.stringify({
        client_id: config.client_id,
        source: 'public',
        instance_name: instanceName,
      })
    ).toString('base64')

    const url = getAuthUrl(redirectUri, state)

    // Redireciona direto pro Google (não retorna JSON, pois é chamado como link)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Erro ao iniciar OAuth Google público:', error)
    return NextResponse.json(
      { error: 'Erro interno ao iniciar autenticação Google' },
      { status: 500 }
    )
  }
}
