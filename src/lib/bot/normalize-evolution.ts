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
  let mediaMimetype: string | null = null
  let mediaDuration: number | null = null
  let mediaWidth: number | null = null
  let mediaHeight: number | null = null
  let mediaFilename: string | null = null

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
    mediaMimetype = data.message.imageMessage.mimetype ?? null
    mediaWidth = (data.message.imageMessage as Record<string, unknown>).width as number ?? null
    mediaHeight = (data.message.imageMessage as Record<string, unknown>).height as number ?? null
  } else if (data.message.audioMessage) {
    content = '[Áudio]'
    contentType = 'audio'
    mediaUrl = data.message.audioMessage.url ?? null
    mediaMimetype = data.message.audioMessage.mimetype ?? null
    mediaDuration = data.message.audioMessage.seconds ?? null
  } else if (data.message.videoMessage) {
    content = data.message.videoMessage.caption || '[Vídeo]'
    contentType = 'video'
    mediaUrl = data.message.videoMessage.url ?? null
    mediaMimetype = data.message.videoMessage.mimetype ?? null
    mediaDuration = data.message.videoMessage.seconds ?? null
  } else if (data.message.documentMessage) {
    // Documentos com mimetype de vídeo são tratados como vídeo
    const isVideo = data.message.documentMessage.mimetype?.startsWith('video/')
    if (isVideo) {
      content = data.message.documentMessage.caption || `[Vídeo: ${data.message.documentMessage.fileName || 'arquivo'}]`
      contentType = 'video'
    } else {
      content = `[Documento: ${data.message.documentMessage.fileName || 'arquivo'}]`
      contentType = 'document'
    }
    mediaMimetype = data.message.documentMessage.mimetype ?? null
    mediaFilename = data.message.documentMessage.fileName ?? null
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
    mediaMimetype,
    mediaDuration,
    mediaWidth,
    mediaHeight,
    mediaFilename,
  }
}
