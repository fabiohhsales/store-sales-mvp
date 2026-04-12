import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/bot/agent'
import { dispatch } from '@/lib/bot/dispatcher'
import { normalizeEvolutionPayload } from '@/lib/bot/normalize-evolution'
import { runEvolutionPipeline, refreshMessageHistory } from '@/lib/bot/pipeline'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncConnectionStateFromWebhook } from '@/lib/whatsapp/connection-state'
import type { EvolutionWebhookPayload } from '@/types/bot'

/** How long to wait for additional messages before running the AI. */
const MESSAGE_DEBOUNCE_MS = 3_000

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

/**
 * Check if the conversation has newer lead messages after the given timestamp.
 * Used to decide whether this invocation should run AI or yield to a newer one.
 */
async function hasNewerLeadMessages(conversationId: string, afterIso: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('from_who', 'lead')
    .gt('created_at', afterIso)

  return (count ?? 0) > 0
}

async function runPipeline(msg: import('@/types/bot').NormalizedEvolutionMessage) {
  try {
    // 1. Save message and resolve pipeline context
    const result = await runEvolutionPipeline(msg)
    if (!result) return

    const { clientContext, contact, conversation, message } = result
    console.log(
      `[Evolution] client=${clientContext.clientId} contact=${contact.id}` +
        ` conv=${conversation.id} stage=${conversation.stage}`
    )

    // 2. Debounce: wait a short period for additional messages
    await new Promise((resolve) => setTimeout(resolve, MESSAGE_DEBOUNCE_MS))

    // 3. Check if newer messages arrived — if so, this invocation yields
    const newer = await hasNewerLeadMessages(conversation.id, message.created_at)
    if (newer) {
      console.log(`[Evolution] conv=${conversation.id} debounce: newer messages found — skipping AI`)
      return
    }

    // 4. Re-fetch message history (includes all messages saved during debounce window)
    const freshHistory = await refreshMessageHistory(conversation.id)
    const freshResult = { ...result, messageHistory: freshHistory }

    // 5. Run AI and dispatch
    const output = await runAgent(freshResult)
    await dispatch(freshResult, output)
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
