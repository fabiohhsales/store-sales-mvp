import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { client_id, token, from_index, to_index } = body

    if (typeof from_index !== 'number' || typeof to_index !== 'number') {
      return NextResponse.json({ error: 'from_index e to_index são obrigatórios' }, { status: 400 })
    }

    const auth = await authenticateRequest(token ?? null, client_id ?? null)
    const supabase = createAdminClient()

    const { data: config, error: fetchError } = await supabase
      .from('panel_bot_config')
      .select('stage_labels')
      .eq('client_id', auth.client_id)
      .single()

    if (fetchError || !config) {
      return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 })
    }

    const stages = sanitizeStageLabels(config.stage_labels)

    if (from_index < 0 || from_index >= stages.length || to_index < 0 || to_index >= stages.length) {
      return NextResponse.json({ error: 'Índices fora dos limites' }, { status: 400 })
    }

    const reordered = [...stages]
    const [moved] = reordered.splice(from_index, 1)
    reordered.splice(to_index, 0, moved)

    const { error: updateError } = await supabase
      .from('panel_bot_config')
      .update({ stage_labels: reordered })
      .eq('client_id', auth.client_id)

    if (updateError) {
      return NextResponse.json({ error: 'Erro ao salvar ordem das etapas' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, stages: reordered })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
