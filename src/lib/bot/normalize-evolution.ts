// Normaliza o payload bruto da Evolution API para a estrutura interna usada pelo pipeline.
// Retorna null se a mensagem deve ser ignorada (grupos, fromMe, sem conteúdo relevante).

import type { EvolutionWebhookPayload, NormalizedEvolutionMessage } from '@/types/bot'

export function normalizeEvolutionPayload(
  payload: EvolutionWebhookPayload
): NormalizedEvolutionMessage | null {
  if (payload.event !== 'messages.upsert') return null

  const { data, instance } = payload

  // Ignora mensagens enviadas por nós (fromMe) — não processa respostas do próprio bot
  if (data.key.fromMe) return null

  // Ignora grupos do WhatsApp
  if (data.key.remoteJid.endsWith('@g.us')) return null

  // Ignora se não houver conteúdo de mensagem
  if (!data.message) return null

  // Extrai texto e tipo de conteúdo
  let content = ''
  let contentType: NormalizedEvolutionMessage['contentType'] = 'unknown'
  let mediaUrl: string | null = null

  if (data.message.conversation) {
    content = data.message.conversation
    contentType = 'text'
  } else if (data.message.extendedTextMessage?.text) {
    content = data.message.extendedTextMessage.text
    contentType = 'text'
  } else if (data.message.imageMessage) {
    content = data.message.imageMessage.caption || '[Imagem]'
    contentType = 'image'
    mediaUrl = data.message.imageMessage.url ?? null
  } else if (data.message.audioMessage) {
    content = '[Áudio]'
    contentType = 'audio'
  } else if (data.message.documentMessage) {
    content = `[Documento: ${data.message.documentMessage.fileName || 'arquivo'}]`
    contentType = 'document'
  }

  // Mensagem sem conteúdo processável (ex: reaction, sticker) — ignora silenciosamente
  if (contentType === 'unknown') return null

  const phoneNumber = data.key.remoteJid.replace('@s.whatsapp.net', '')

  return {
    instanceName: instance,
    remoteJid: data.key.remoteJid,
    phoneNumber,
    contactName: data.pushName ?? '',
    messageId: data.key.id,
    content,
    contentType,
    timestamp: new Date((data.messageTimestamp ?? Date.now() / 1000) * 1000),
    mediaUrl,
  }
}
