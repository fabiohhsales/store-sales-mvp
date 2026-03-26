// Webhook receiver: substitui o endpoint do n8n para todas as instâncias do Chatwoot.
// Cada cliente tem sua própria Account Chatwoot — identificamos pelo account.id do payload.

import { NextRequest, NextResponse } from 'next/server'
import type { ChatwootWebhookPayload, NormalizedWebhookMessage } from '@/types/bot'
import { runBasePipeline } from '@/lib/bot/pipeline'
import { runAgent } from '@/lib/bot/agent'
import { dispatch } from '@/lib/bot/dispatcher'

// Normaliza o payload do Chatwoot (formato v4.x) para estrutura interna.
// Retorna null se a mensagem deve ser ignorada.
function normalizePayload(payload: ChatwootWebhookPayload): NormalizedWebhookMessage | null {
  if (payload.event !== 'message_created') return null

  // message_type: 0=incoming (paciente), 1=outgoing (agente/bot)
  if (payload.message_type !== 0) return null

  // Ignora notas internas
  if (payload.private) return null

  // Ignora mensagens sem ID (malformed)
  if (!payload.id) return null

  const contact = payload.conversation.contact

  // Detecta tipo de conteúdo pela extensão/file_type do attachment
  const attachments = payload.attachments ?? []
  let contentType: NormalizedWebhookMessage['contentType'] = 'text'
  if (attachments.length > 0) {
    const ft = attachments[0].file_type
    if (ft === 'audio') contentType = 'audio'
    else if (ft === 'image' || ft === 'video') contentType = 'image'
  }

  return {
    chatwootAccountId: payload.account.id,
    chatwootConversationId: payload.conversation.id,
    chatwootContactId: contact.id,
    chatwootMessageId: payload.id,
    contactName: contact.name,
    contactPhone: contact.phone_number ?? null,
    contactIdentifier: contact.identifier ?? null,
    messageContent: payload.content ?? '',
    contentType,
    attachments: attachments.map((a) => ({ data_url: a.data_url, file_type: a.file_type })),
  }
}

export async function POST(req: NextRequest) {
  let payload: ChatwootWebhookPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  console.log(`[Webhook] Recebido event=${payload.event} account=${payload.account?.id} msg_type=${payload.message_type}`)

  const normalized = normalizePayload(payload)
  if (!normalized) {
    // Evento irrelevante (outgoing, status change, etc.) — responde 200 imediatamente
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Dispara o pipeline em background e responde 200 de imediato.
  // Em EasyPanel (Node.js persistente) a Promise continua executando após o response.
  void runPipeline(normalized)

  return NextResponse.json({ ok: true })
}

async function runPipeline(msg: NormalizedWebhookMessage) {
  try {
    const result = await runBasePipeline(msg)
    if (!result) return

    const { clientContext, contact, conversation } = result
    console.log(
      `[Webhook] account=${msg.chatwootAccountId} client=${clientContext.clientId}` +
      ` contact=${contact.id} conv=${conversation.id} type=${msg.contentType}`
    )

    const output = await runAgent(result)
    await dispatch(result, output)
  } catch (err) {
    console.error('[Webhook] Erro no pipeline:', err)
  }
}
