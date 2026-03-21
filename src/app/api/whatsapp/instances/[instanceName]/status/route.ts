import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectionState } from '@/lib/api/evolution'
import { getWhatsAppConfigByInstanceName, updateWhatsAppConfig } from '@/lib/db/whatsapp-config'
import { updateClient } from '@/lib/db/clients'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const { instanceName } = await params

    // Consulta status na Evolution API
    const connectionState = await getConnectionState(instanceName)
    const state = connectionState.instance?.state || 'close'

    // Se conectado, atualiza o banco
    if (state === 'open') {
      const config = await getWhatsAppConfigByInstanceName(instanceName)
      if (config) {
        await updateWhatsAppConfig(config.client_id, {
          connection_status: 'open',
          connected_at: new Date().toISOString(),
        })

        // Avança status do cliente se estava pendente
        await updateClient(config.client_id, { status: 'pending_google' })
      }
    }

    return NextResponse.json({
      instance: instanceName,
      state,
    })
  } catch (error) {
    console.error('Erro ao verificar status WhatsApp:', error)
    return NextResponse.json(
      { error: 'Erro interno ao verificar status' },
      { status: 500 }
    )
  }
}
