import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBotConfigByClientId } from '@/lib/db/bot-config'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token é obrigatório' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Valida o token
    const { data: tokenData, error: tokenError } = await admin
      .from('panel_embed_tokens')
      .select('client_id, user_id')
      .eq('token', token)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { client_id } = tokenData

    // 2. Busca chatwoot_account_id
    const { data: whatsappConfig } = await admin
      .from('panel_whatsapp_config')
      .select('chatwoot_account_id')
      .eq('client_id', client_id)
      .single()

    // 3. Busca stage_labels do bot config
    const botConfig = await getBotConfigByClientId(client_id)
    const stageLabels = sanitizeStageLabels(botConfig?.stage_labels)

    // 4. Atualiza last_used_at
    admin
      .from('panel_embed_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)
      .then(() => {})

    return NextResponse.json({
      client_id,
      chatwoot_account_id: whatsappConfig?.chatwoot_account_id ?? null,
      stage_labels: stageLabels,
    })
  } catch (error) {
    console.error('Erro na autenticação embed:', error)
    return NextResponse.json(
      { error: 'Erro interno na autenticação' },
      { status: 500 }
    )
  }
}
