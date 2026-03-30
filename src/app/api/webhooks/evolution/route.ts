// Webhook receptor da Evolution API — substitui o endpoint do Chatwoot.
// Recebe mensagens diretamente do WhatsApp via Evolution API v2.x.
// Identifica o cliente pelo evolution_instance_name (sem dependência do Chatwoot).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeEvolutionPayload } from '@/lib/bot/normalize-evolution'
import { runEvolutionPipeline } from '@/lib/bot/pipeline'
import { runAgent } from '@/lib/bot/agent'
import { dispatch } from '@/lib/bot/dispatcher'
import type { EvolutionWebhookPayload } from '@/types/bot'

export async function POST(req: NextRequest) {
  let payload: EvolutionWebhookPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { event, instance } = payload
  console.log(`[Evolution] event=${event} instance=${instance}`)

  // Atualiza status de conexão WhatsApp no painel
  if (event === 'connection.update') {
    void handleConnectionUpdate(payload)
    return NextResponse.json({ ok: true })
  }

  if (event !== 'messages.upsert') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const normalized = normalizeEvolutionPayload(payload)
  if (!normalized) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  console.log(
    `[Evolution] instance=${normalized.instanceName} from=${normalized.phoneNumber}` +
    ` type=${normalized.contentType} msgId=${normalized.messageId}`
  )

  // Responde 200 imediatamente — pipeline roda em background
  void runPipeline(normalized)

  return NextResponse.json({ ok: true })
}

async function runPipeline(msg: import('@/types/bot').NormalizedEvolutionMessage) {
  try {
    const result = await runEvolutionPipeline(msg)
    if (!result) return

    const { clientContext, contact, conversation } = result
    console.log(
      `[Evolution] client=${clientContext.clientId} contact=${contact.id}` +
      ` conv=${conversation.id} stage=${conversation.stage}`
    )

    const output = await runAgent(result)
    await dispatch(result, output)
  } catch (err) {
    console.error('[Evolution] Erro no pipeline:', err)
  }
}

// Debounce: evita DB writes repetidos para o mesmo estado
const lastKnownState = new Map<string, string>()

// Sincroniza o status de conexão da instância com panel_whatsapp_config
async function handleConnectionUpdate(payload: EvolutionWebhookPayload) {
  const { instance, state } = payload
  if (!state) return

  // Ignora se o estado não mudou desde o último evento
  if (lastKnownState.get(instance) === state) return
  lastKnownState.set(instance, state)

  const supabase = createAdminClient()

  const connectionStatus =
    state === 'open' ? 'open' :
    state === 'connecting' ? 'connecting' :
    'disconnected'

  const updates: Record<string, unknown> = {
    connection_status: connectionStatus,
    updated_at: new Date().toISOString(),
  }

  if (state === 'open') {
    updates.connected_at = new Date().toISOString()
    updates.disconnected_at = null
  } else if (state === 'close') {
    updates.disconnected_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('panel_whatsapp_config')
    .update(updates)
    .eq('evolution_instance_name', instance)

  if (error) {
    console.error(`[Evolution] Falha ao atualizar connection status (${instance}):`, error.message)
  } else {
    console.log(`[Evolution] connection.update: instance=${instance} state=${state}`)
  }
}
