import { NextRequest, NextResponse } from 'next/server'
import { normalizeEvolutionPayload } from '@/lib/bot/normalize-evolution'
import { checkIfStoreInstance, runStorePipelineRoute } from '@/lib/bot/store-pipeline'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EvolutionWebhookPayload } from '@/types/bot'

export async function POST(req: NextRequest) {
  let payload: EvolutionWebhookPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  const { event, instance } = payload
  console.log(`[Store-Evolution-Webhook] event=${event} instance=${instance}`)

  if (event === 'connection.update') {
    void handleStoreConnectionUpdate(payload)
    return NextResponse.json({ ok: true })
  }

  if (event === 'messages.update') {
    void handleStoreMessagesUpdate(payload)
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
    `[Store-Evolution-Webhook] instance=${normalized.instanceName} from=${normalized.phoneNumber}` +
      ` type=${normalized.contentType} msgId=${normalized.messageId}`
  )

  // 1. Process store pipeline
  const isStore = await checkIfStoreInstance(normalized.instanceName)
  if (isStore) {
    void runStorePipelineRoute(normalized)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, skipped: true, reason: 'not_store_instance' })
}

/**
 * Handle connection updates specifically for store channels.
 */
async function handleStoreConnectionUpdate(payload: EvolutionWebhookPayload) {
  const { instance, state } = payload
  if (!state) return

  const dbStatus = state === 'open' ? 'open' : (state === 'connecting' ? 'connecting' : 'disconnected')
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('store_channels')
    .update({
      connection_status: dbStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('evolution_instance_name', instance)

  if (error) {
    console.error(`[Store-Evolution-Webhook] Failed to update connection_status for instance ${instance}:`, error.message)
  } else {
    console.log(`[Store-Evolution-Webhook] Updated connection_status to ${dbStatus} for instance ${instance}`)
  }
}

/**
 * Handle message ack updates specifically for store message records.
 */
async function handleStoreMessagesUpdate(payload: EvolutionWebhookPayload) {
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
      .from('store_messages')
      .update({ whatsapp_status: whatsappStatus })
      .eq('evolution_message_id', u.key.id)

    if (error) {
      console.warn(`[Store-Evolution-Webhook] Falha ao atualizar whatsapp_status para msg=${u.key.id}:`, error.message)
    }
  }
}
