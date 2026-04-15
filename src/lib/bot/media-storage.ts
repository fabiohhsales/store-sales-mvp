import { createAdminClient } from '@/lib/supabase/admin'

export interface MediaUploadResult {
  storagePath: string | null
  buffer: Buffer | null
  resolvedMime: string
  source: 'direct_url' | 'evolution' | null
}

type MediaLogger = (event: string, payload: Record<string, unknown>) => void

interface MediaUploadOptions {
  fromMe?: boolean
}

interface EvolutionMediaResponse {
  base64: string | null
  mimetype: string | null
}

const DEFAULT_MEDIA_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_DELAYS_MS = [0, 300, 900]

function resolveExtension(mimetype: string): string {
  return mimetype.split('/')[1]?.split(';')[0] ?? 'bin'
}

function sniffMimeFromBuffer(buf: Buffer, fallback: string): string {
  if (buf.length < 4) return fallback
  // JPEG: FF D8
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  // GIF: 47 49 46
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  // PDF: 25 50 44 46
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'
  // WebM: 1A 45 DF A3
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'audio/webm'
  // OGG: 4F 67 67 53
  if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'audio/ogg'
  return fallback
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

function findFirstStringByKeys(value: unknown, keys: string[]): string | null {
  const queue: unknown[] = [value]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue
    }
    seen.add(current)

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    const record = current as Record<string, unknown>
    for (const key of keys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }

    queue.push(...Object.values(record))
  }

  return null
}

async function parseEvolutionMediaResponse(
  res: Response,
  fallbackMime: string
): Promise<EvolutionMediaResponse> {
  const text = await res.text()
  const trimmed = text.trim()

  if (!trimmed) {
    return { base64: null, mimetype: fallbackMime }
  }

  let payload: unknown = null
  try {
    payload = JSON.parse(trimmed)
  } catch {
    payload = null
  }

  if (!payload) {
    return {
      base64: trimmed,
      mimetype: fallbackMime,
    }
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return {
      base64: payload.trim(),
      mimetype: fallbackMime,
    }
  }

  return {
    base64: findFirstStringByKeys(payload, ['base64']),
    mimetype: findFirstStringByKeys(payload, ['mimetype', 'mime_type']) ?? fallbackMime,
  }
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
  fromMe = false,
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

  const candidates = [
    {
      endpoint: `/chat/getBase64FromMediaMessage/${instanceName}`,
      body: {
        message: {
          key: {
            id: messageId,
          },
        },
        convertToMp4: false,
      },
      contract: 'chat_v2',
    },
    {
      endpoint: `/message/getBase64FromMediaMessage/${instanceName}`,
      body: {
        message: {
          key: {
            remoteJid,
            fromMe,
            id: messageId,
          },
        },
      },
      contract: 'message_legacy',
    },
  ] as const

  for (const candidate of candidates) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), DEFAULT_MEDIA_TIMEOUT_MS)
      const res = await fetch(`${evolutionUrl}${candidate.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify(candidate.body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))

      if (!res.ok) {
        logger?.('evolution_media_fetch_failed', {
          ...meta,
          status: res.status,
          instanceName,
          remoteJid,
          endpoint: candidate.endpoint,
          contract: candidate.contract,
          fromMe,
        })
        continue
      }

      const parsed = await parseEvolutionMediaResponse(res, fallbackMime)
      if (!parsed.base64) {
        logger?.('evolution_media_fetch_failed', {
          ...meta,
          reason: 'missing_base64',
          instanceName,
          remoteJid,
          endpoint: candidate.endpoint,
          contract: candidate.contract,
          fromMe,
        })
        continue
      }

      return {
        buffer: Buffer.from(parsed.base64, 'base64'),
        resolvedMime: parsed.mimetype ?? fallbackMime,
        source: 'evolution',
      }
    } catch (error) {
      logger?.('evolution_media_fetch_failed', {
        ...meta,
        instanceName,
        remoteJid,
        endpoint: candidate.endpoint,
        contract: candidate.contract,
        fromMe,
        reason: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  return null
}

export async function uploadMediaToStorage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  clientId: string,
  conversationId: string,
  mimetype: string,
  mediaUrl: string | null = null,
  logger?: MediaLogger,
  options: MediaUploadOptions = {}
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
        options.fromMe ?? false,
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

  // Normaliza MIME quando fallback genérico: detecta tipo real pelos magic bytes
  if (downloaded.resolvedMime === 'application/octet-stream') {
    downloaded = {
      ...downloaded,
      resolvedMime: sniffMimeFromBuffer(downloaded.buffer, 'application/octet-stream'),
    }
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
