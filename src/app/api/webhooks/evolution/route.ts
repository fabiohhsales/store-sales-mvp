import { NextRequest, NextResponse } from 'next/server'
import { normalizeEvolutionPayload } from '@/lib/bot/normalize-evolution'
import { runEvolutionPipeline } from '@/lib/bot/pipeline'
import { runConversationBotTurn } from '@/lib/bot/run-conversation-turn'
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

  if (event === 'messages.update') {
    void handleMessagesUpdate(payload)
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

    // 4. Run the same bot-turn pipeline used elsewhere in the app
    await runConversationBotTurn(result)
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

// Atualiza whatsapp_status das mensagens enviadas por nós com base nos acks da Evolution.
// Status codes: 2=sent, 3=delivered, 4=read, 5=played
async function handleMessagesUpdate(payload: EvolutionWebhookPayload) {
  interface UpdateEntry {
    key: { remoteJid: string; fromMe: boolean; id: string }
    update: { status?: number }
  }
  const rawData = (payload as unknown as { data: unknown }).data
  if (!Array.isArray(rawData) || rawData.length === 0) return

  const statusMap: Record<number, string> = { 2: 'sent', 3: 'delivered', 4: 'read', 5: 'played' }
  const supabase = createAdminClient()

  for (const u of rawData as UpdateEntry[]) {
    if (!u.key?.fromMe) continue
    const whatsappStatus = statusMap[u.update?.status ?? 0]
    if (!whatsappStatus) continue

    const { error } = await supabase
      .from('messages')
      .update({ whatsapp_status: whatsappStatus })
      .eq('evolution_message_id', u.key.id)

    if (error) {
      console.warn(`[Evolution] Falha ao atualizar whatsapp_status para msg=${u.key.id}:`, error.message)
    }
  }
}
