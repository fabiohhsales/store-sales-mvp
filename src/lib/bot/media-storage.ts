import { createAdminClient } from '@/lib/supabase/admin'

export interface MediaUploadResult {
  storagePath: string | null
  buffer: Buffer | null
  resolvedMime: string
  source: 'direct_url' | 'evolution' | null
}

type MediaLogger = (event: string, payload: Record<string, unknown>) => void

const DEFAULT_MEDIA_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_DELAYS_MS = [0, 300, 900]

function resolveExtension(mimetype: string): string {
  return mimetype.split('/')[1]?.split(';')[0] ?? 'bin'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pickResolvedMime(headerMime: string | null, fallbackMime: string): string {
  if (!headerMime || headerMime === 'application/octet-stream') {
    return fallbackMime
  }
  return headerMime
}

async function fetchMediaFromDirectUrl(
  mediaUrl: string,
  fallbackMime: string,
  logger?: MediaLogger,
  meta: Record<string, unknown> = {}
): Promise<{ buffer: Buffer; resolvedMime: string; source: 'direct_url' } | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_MEDIA_TIMEOUT_MS)
    const res = await fetch(mediaUrl, {
      method: 'GET',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (!res.ok) {
      logger?.('direct_media_url_failed', {
        ...meta,
        mediaUrl,
        status: res.status,
      })
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.byteLength === 0) {
      logger?.('direct_media_url_failed', {
        ...meta,
        mediaUrl,
        reason: 'empty_body',
      })
      return null
    }

    return {
      buffer,
      resolvedMime: pickResolvedMime(res.headers.get('content-type'), fallbackMime),
      source: 'direct_url',
    }
  } catch (error) {
    logger?.('direct_media_url_failed', {
      ...meta,
      mediaUrl,
      reason: error instanceof Error ? error.message : 'unknown_error',
    })
    return null
  }
}

async function fetchMediaFromEvolution(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fallbackMime: string,
  logger?: MediaLogger,
  meta: Record<string, unknown> = {}
): Promise<{ buffer: Buffer; resolvedMime: string; source: 'evolution' } | null> {
  const evolutionUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY

  if (!evolutionUrl || !evolutionKey) {
    logger?.('evolution_media_fetch_failed', {
      ...meta,
      reason: 'not_configured',
      hasUrl: Boolean(evolutionUrl),
      hasKey: Boolean(evolutionKey),
    })
    return null
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_MEDIA_TIMEOUT_MS)
    const res = await fetch(`${evolutionUrl}/message/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({ message: { key: { remoteJid, fromMe: false, id: messageId } } }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (!res.ok) {
      logger?.('evolution_media_fetch_failed', {
        ...meta,
        status: res.status,
        instanceName,
        remoteJid,
      })
      return null
    }

    const data = await res.json()
    const base64 = data.base64 as string | undefined
    if (!base64) {
      logger?.('evolution_media_fetch_failed', {
        ...meta,
        reason: 'missing_base64',
        instanceName,
        remoteJid,
      })
      return null
    }

    return {
      buffer: Buffer.from(base64, 'base64'),
      resolvedMime: (data.mimetype as string | undefined) ?? fallbackMime,
      source: 'evolution',
    }
  } catch (error) {
    logger?.('evolution_media_fetch_failed', {
      ...meta,
      instanceName,
      remoteJid,
      reason: error instanceof Error ? error.message : 'unknown_error',
    })
    return null
  }
}

export async function uploadMediaToStorage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  clientId: string,
  conversationId: string,
  mimetype: string,
  mediaUrl: string | null = null,
  logger?: MediaLogger
): Promise<MediaUploadResult> {
  const nil: MediaUploadResult = {
    storagePath: null,
    buffer: null,
    resolvedMime: mimetype,
    source: null,
  }

  let downloaded: { buffer: Buffer; resolvedMime: string; source: 'direct_url' | 'evolution' } | null = null

  for (const [attempt, delayMs] of DEFAULT_RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) {
      await sleep(delayMs)
    }

    const meta = { attempt: attempt + 1, messageId, clientId, conversationId }

    if (mediaUrl) {
      downloaded = await fetchMediaFromDirectUrl(mediaUrl, mimetype, logger, meta)
    }

    if (!downloaded) {
      downloaded = await fetchMediaFromEvolution(
        instanceName,
        remoteJid,
        messageId,
        mimetype,
        logger,
        meta
      )
    }

    if (downloaded) {
      break
    }
  }

  if (!downloaded) {
    return nil
  }

  const storagePath = `${clientId}/${conversationId}/${messageId}.${resolveExtension(downloaded.resolvedMime)}`
  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('desk-media')
    .upload(storagePath, downloaded.buffer, { contentType: downloaded.resolvedMime, upsert: false })

  if (error && !error.message.includes('already exists')) {
    logger?.('storage_upload_failed', {
      clientId,
      conversationId,
      messageId,
      storagePath,
      error: error.message,
      source: downloaded.source,
    })
    return {
      storagePath: null,
      buffer: downloaded.buffer,
      resolvedMime: downloaded.resolvedMime,
      source: downloaded.source,
    }
  }

  return {
    storagePath,
    buffer: downloaded.buffer,
    resolvedMime: downloaded.resolvedMime,
    source: downloaded.source,
  }
}
