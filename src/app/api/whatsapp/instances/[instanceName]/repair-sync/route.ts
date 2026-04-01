import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPanelEvolutionWebhookUrl, setWebhook } from '@/lib/api/evolution'
import { formatConnectionPayload, reconcileConnectionState } from '@/lib/whatsapp/connection-state'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    const { instanceName } = await params
    const webhookUrl = getPanelEvolutionWebhookUrl()
    await setWebhook(instanceName, webhookUrl)
    const snapshot = await reconcileConnectionState(instanceName)

    return NextResponse.json({
      ok: true,
      webhookUrl,
      ...formatConnectionPayload(snapshot),
    })
  } catch (error) {
    console.error('Erro ao reparar sincronizacao da instância:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao reparar sincronizacao' },
      { status: 500 }
    )
  }
}
