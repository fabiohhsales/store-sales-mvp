import { createAdminClient } from '@/lib/supabase/admin'

export interface MediaUploadResult {
  storagePath: string | null
  buffer: Buffer | null
  resolvedMime: string
  source: 'direct_url' | 'evolution' | null
  oggTruncated: boolean
}

type MediaLogger = (event: string, payload: Record<string, unknown>) => void

interface MediaUploadOptions {
  fromMe?: boolean
  upsert?: boolean
}

interface EvolutionMediaResponse {
  base64: string | null
  mimetype: string | null
}

const DEFAULT_MEDIA_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_DELAYS_MS = [0, 300, 900]

function normalizeMimeType(raw: string): string {
  return raw.split(';')[0].trim().toLowerCase()
}

function resolveExtension(mimetype: string): string {
  return mimetype.split('/')[1]?.split(';')[0] ?? 'bin'
}

export function isImageMime(mimetype: string | null | undefined): boolean {
  return typeof mimetype === 'string' && mimetype.startsWith('image/')
}

export function sniffMimeFromBuffer(buf: Buffer, fallback: string): string {
  if (buf.length < 4) return fallback
  // JPEG: FF D8
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  // GIF: 47 49 46
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  // WebP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp'
  }
  // PDF: 25 50 44 46
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'
  // OGG: OggS
  if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'audio/ogg'
  return fallback
}

// Valida a integridade estrutural de um buffer OGG: header "OggS" no início
// e uma última página com o bit end-of-stream (0x04) setado.
//
// Layout de página OGG (RFC 3533 §6):
//   byte 0–3: capture pattern "OggS" (0x4F 0x67 0x67 0x53)
//   byte 4:   stream_structure_version — FIXO em 0x00
//   byte 5:   header_type_flag (bit 0x04 = end-of-stream)
//
// A busca exige o par (capture pattern + version = 0x00) para reduzir ao máximo
// matches espúrios dentro de payload Opus — ~1 em 2^40 vs ~1 em 2^32 com só a
// capture pattern. O loop pára em tail.length - 6 porque precisamos ler até o
// byte 5 da página sem sair dos limites do subarray.
function validateOggStructure(buffer: Buffer): { ok: boolean; reason?: string } {
  if (buffer.length < 4) return { ok: false, reason: 'too_short' }
  const hasHeader =
    buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53
  if (!hasHeader) return { ok: false, reason: 'missing_oggs_header' }

  const tail = buffer.subarray(Math.max(0, buffer.length - 8192))
  let lastOggS = -1
  for (let i = tail.length - 6; i >= 0; i--) {
    if (
      tail[i] === 0x4f &&
      tail[i + 1] === 0x67 &&
      tail[i + 2] === 0x67 &&
      tail[i + 3] === 0x53 &&
      tail[i + 4] === 0x00
    ) {
      lastOggS = i
      break
    }
  }
  if (lastOggS < 0) return { ok: false, reason: 'no_trailing_page' }
  const headerType = tail[lastOggS + 5]
  if ((headerType & 0x04) === 0) return { ok: false, reason: 'missing_eos_flag' }
  return { ok: true }
}

function isOggLikeMime(mime: string | null | undefined): boolean {
  if (!mime) return false
  return /ogg|opus/i.test(mime)
}

function resolveDirectImageMime(
  buffer: Buffer,
  resolvedMime: string,
  fallbackMime: string,
  logger?: MediaLogger,
  meta: Record<string, unknown> = {}
): string | null {
  const expectsImage = isImageMime(resolvedMime) || isImageMime(fallbackMime)
  if (!expectsImage) return resolvedMime

  const sniffedMime = sniffMimeFromBuffer(buffer, 'application/octet-stream')
  if (!isImageMime(sniffedMime)) {
    logger?.('direct_media_url_invalid_image', {
      ...meta,
      previousMime: resolvedMime,
      sniffedMime,
    })
    return null
  }

  if (sniffedMime !== resolvedMime) {
    logger?.('media_mime_sniffed', {
      ...meta,
      source: 'direct_url',
      previousMime: resolvedMime,
      sniffedMime,
    })
  }

  return sniffedMime
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
      base64: sanitizeBase64(trimmed),
      mimetype: fallbackMime,
    }
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return {
      base64: sanitizeBase64(payload),
      mimetype: fallbackMime,
    }
  }

  const rawBase64 = findFirstStringByKeys(payload, ['base64'])
  const sanitized = sanitizeBase64(rawBase64)

  return {
    base64: sanitized,
    mimetype: findFirstStringByKeys(payload, ['mimetype', 'mime_type']) ?? fallbackMime,
  }
}

function sanitizeBase64(raw: string | null): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length < 4) return null
  if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return null
  return trimmed
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

    const resolvedMime = pickResolvedMime(res.headers.get('content-type'), fallbackMime)
    const normalizedMime = resolveDirectImageMime(buffer, resolvedMime, fallbackMime, logger, {
      ...meta,
      mediaUrl,
    })
    if (!normalizedMime) {
      return null
    }

    return {
      buffer,
      resolvedMime: normalizedMime,
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

      const buffer = Buffer.from(parsed.base64, 'base64')
      if (buffer.byteLength === 0) {
        logger?.('evolution_media_empty_buffer', {
          ...meta,
          instanceName,
          remoteJid,
          endpoint: candidate.endpoint,
          contract: candidate.contract,
          fromMe,
          base64Length: parsed.base64.length,
        })
        continue
      }

      return {
        buffer,
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
    oggTruncated: false,
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

  // Quando o provider retorna MIME genérico, tenta inferir apenas tipos seguros
  // ligados ao bug atual de imagem/documento.
  if (!downloaded.resolvedMime || downloaded.resolvedMime.trim().length === 0 || downloaded.resolvedMime === 'application/octet-stream') {
    const sniffedMime = sniffMimeFromBuffer(downloaded.buffer, 'application/octet-stream')
    if (sniffedMime !== downloaded.resolvedMime) {
      logger?.('media_mime_sniffed', {
        clientId,
        conversationId,
        messageId,
        source: downloaded.source,
        previousMime: downloaded.resolvedMime,
        sniffedMime,
      })
    }
    downloaded = {
      ...downloaded,
      resolvedMime: sniffedMime,
    }
  }

  const storagePath = `${clientId}/${conversationId}/${messageId}.${resolveExtension(downloaded.resolvedMime)}`
  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('desk-media')
    .upload(storagePath, downloaded.buffer, {
      contentType: downloaded.resolvedMime,
      upsert: options.upsert ?? false,
    })

  // Detecta OGG truncado ANTES de devolver para o caller, para permitir que
  // a pipeline pule a transcrição cedo. O upload continua sendo feito: browsers
  // toleram OGG incompleto, então o player do Desk ainda consegue reproduzir.
  let oggTruncated = false
  if (isOggLikeMime(downloaded.resolvedMime)) {
    const oggCheck = validateOggStructure(downloaded.buffer)
    if (!oggCheck.ok) {
      oggTruncated = true
      logger?.('ogg_truncated', {
        clientId,
        conversationId,
        messageId,
        source: downloaded.source,
        reason: oggCheck.reason,
        bytes: downloaded.buffer.byteLength,
        firstBytesHex: downloaded.buffer.subarray(0, 8).toString('hex'),
        lastBytesHex: downloaded.buffer.subarray(-8).toString('hex'),
      })
    }
  }

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
      oggTruncated,
    }
  }

  return {
    storagePath,
    buffer: downloaded.buffer,
    resolvedMime: downloaded.resolvedMime,
    source: downloaded.source,
    oggTruncated,
  }
}
