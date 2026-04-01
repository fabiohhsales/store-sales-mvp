import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/bot/agent'
import { dispatch } from '@/lib/bot/dispatcher'
import { normalizeEvolutionPayload } from '@/lib/bot/normalize-evolution'
import { runEvolutionPipeline } from '@/lib/bot/pipeline'
import { syncConnectionStateFromWebhook } from '@/lib/whatsapp/connection-state'
import type { EvolutionWebhookPayload } from '@/types/bot'

export async function POST(req: NextRequest) {
  let payload: EvolutionWebhookPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  const { event, instance } = payload
  console.log(`[Evolution] event=${event} instance=${instance}`)

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

async function handleConnectionUpdate(payload: EvolutionWebhookPayload) {
  const { instance, state } = payload
  if (!state) return

  try {
    await syncConnectionStateFromWebhook(instance, state)
    console.log(`[Evolution] connection.update: instance=${instance} state=${state}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido'
    console.error(`[Evolution] Falha ao atualizar connection status (${instance}):`, message)
  }
}
