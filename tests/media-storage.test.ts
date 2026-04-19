import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { uploadMediaToStorage } from '@/lib/bot/media-storage'

function buildAdmin(options?: { uploadErrorMessage?: string | null }) {
  const uploads: Array<{ path: string; contentType: string | undefined; bytes: number }> = []

  const admin = {
    storage: {
      from() {
        return {
          async upload(path: string, fileBuffer: Buffer, config: { contentType?: string }) {
            uploads.push({ path, contentType: config.contentType, bytes: fileBuffer.length })
            return {
              error: options?.uploadErrorMessage ? { message: options.uploadErrorMessage } : null,
            }
          },
        }
      },
    },
  }

  return { admin, uploads }
}

function makeOggBuffer(options?: { eos?: boolean }): Buffer {
  const eos = options?.eos ?? true
  return Buffer.from([
    0x4f, 0x67, 0x67, 0x53, 0x00, 0x02,
    0x11, 0x22, 0x33, 0x44,
    0x4f, 0x67, 0x67, 0x53, 0x00, eos ? 0x04 : 0x00,
    0x55, 0x66, 0x77, 0x88,
  ])
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn())
  process.env.EVOLUTION_API_URL = 'https://evolution.example'
  process.env.EVOLUTION_API_KEY = 'evolution-key'
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.EVOLUTION_API_URL
  delete process.env.EVOLUTION_API_KEY
})

describe('uploadMediaToStorage', () => {
  it('sniffs jpeg media when Evolution falls back to application/octet-stream', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: jpegBuffer.toString('base64'),
          mimetype: 'application/octet-stream',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'img-jpeg',
      'client-A',
      'conv-1',
      'application/octet-stream',
      null,
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/img-jpeg.jpeg',
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/img-jpeg.jpeg',
      contentType: 'image/jpeg',
      bytes: jpegBuffer.length,
    })
    expect(logger).toHaveBeenCalledWith(
      'media_mime_sniffed',
      expect.objectContaining({
        messageId: 'img-jpeg',
        sniffedMime: 'image/jpeg',
      })
    )
  })

  it('sniffs png media when Evolution falls back to application/octet-stream', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: pngBuffer.toString('base64'),
          mimetype: 'application/octet-stream',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'img-png',
      'client-A',
      'conv-1',
      'application/octet-stream'
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/img-png.png',
      resolvedMime: 'image/png',
      source: 'evolution',
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/img-png.png',
      contentType: 'image/png',
      bytes: pngBuffer.length,
    })
  })

  it('sniffs webp media when Evolution falls back to application/octet-stream', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20,
    ])

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: webpBuffer.toString('base64'),
          mimetype: 'application/octet-stream',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'img-webp',
      'client-A',
      'conv-1',
      'application/octet-stream'
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/img-webp.webp',
      resolvedMime: 'image/webp',
      source: 'evolution',
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/img-webp.webp',
      contentType: 'image/webp',
      bytes: webpBuffer.length,
    })
  })

  it('keeps application/octet-stream when bytes are unknown', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const unknownBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05])

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: unknownBuffer.toString('base64'),
          mimetype: 'application/octet-stream',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'img-bin',
      'client-A',
      'conv-1',
      'application/octet-stream'
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/img-bin.octet-stream',
      resolvedMime: 'application/octet-stream',
      source: 'evolution',
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/img-bin.octet-stream',
      contentType: 'application/octet-stream',
      bytes: unknownBuffer.length,
    })
  })

  it('does not reclassify generic webm bytes as audio when the bug is image-only', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const ebmlBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42])

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: ebmlBuffer.toString('base64'),
          mimetype: 'application/octet-stream',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'img-ebml',
      'client-A',
      'conv-1',
      'application/octet-stream'
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/img-ebml.octet-stream',
      resolvedMime: 'application/octet-stream',
      source: 'evolution',
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/img-ebml.octet-stream',
      contentType: 'application/octet-stream',
      bytes: ebmlBuffer.length,
    })
  })

  it('prefers the direct mediaUrl when it is still available', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    fetchMock.mockResolvedValue(
      new Response(pngBuffer, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-1',
      'client-A',
      'conv-1',
      'image/jpeg',
      'https://media.example/image'
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-1.png',
      resolvedMime: 'image/png',
      source: 'direct_url',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/evo-1.png',
      contentType: 'image/png',
      bytes: pngBuffer.length,
    })
  })

  it('falls back to Evolution when the direct image URL returns non-image bytes', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

    fetchMock
      .mockResolvedValueOnce(
        new Response(Buffer.from('not-an-image'), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            base64: jpegBuffer.toString('base64'),
            mimetype: 'image/jpeg',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-direct-invalid',
      'client-A',
      'conv-1',
      'image/jpeg',
      'https://media.example/bad-image',
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-direct-invalid.jpeg',
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/evo-direct-invalid.jpeg',
      contentType: 'image/jpeg',
      bytes: jpegBuffer.length,
    })
    expect(logger).toHaveBeenCalledWith(
      'direct_media_url_invalid_image',
      expect.objectContaining({
        mediaUrl: 'https://media.example/bad-image',
        previousMime: 'image/jpeg',
      })
    )
  })

  it('normalizes direct image MIME from valid bytes when the URL header is wrong', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

    fetchMock.mockResolvedValue(
      new Response(jpegBuffer, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-direct-normalized',
      'client-A',
      'conv-1',
      'image/jpeg',
      'https://media.example/mismatch-image',
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-direct-normalized.jpeg',
      resolvedMime: 'image/jpeg',
      source: 'direct_url',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/evo-direct-normalized.jpeg',
      contentType: 'image/jpeg',
      bytes: jpegBuffer.length,
    })
    expect(logger).toHaveBeenCalledWith(
      'media_mime_sniffed',
      expect.objectContaining({
        source: 'direct_url',
        previousMime: 'image/png',
        sniffedMime: 'image/jpeg',
      })
    )
  })

  it('falls back to Evolution when the direct mediaUrl fails', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            base64: Buffer.from('fallback-audio').toString('base64'),
            mimetype: 'audio/ogg',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-2',
      'client-A',
      'conv-1',
      'audio/webm',
      'https://media.example/audio'
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-2.ogg',
      resolvedMime: 'audio/ogg',
      source: 'evolution',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://evolution.example/chat/getBase64FromMediaMessage/inst-a')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      message: {
        key: {
          id: 'evo-2',
        },
      },
      convertToMp4: false,
    })
    expect(uploads[0]).toMatchObject({
      path: 'client-A/conv-1/evo-2.ogg',
      contentType: 'audio/ogg',
    })
  })

  it('falls back to the legacy Evolution contract when the documented chat endpoint fails', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            base64: Buffer.from('legacy-audio').toString('base64'),
            mimetype: 'audio/ogg',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-legacy',
      'client-A',
      'conv-1',
      'audio/webm',
      null,
      undefined,
      { fromMe: true }
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-legacy.ogg',
      resolvedMime: 'audio/ogg',
      source: 'evolution',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://evolution.example/chat/getBase64FromMediaMessage/inst-a')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://evolution.example/message/getBase64FromMediaMessage/inst-a')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      message: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: true,
          id: 'evo-legacy',
        },
      },
    })
    expect(uploads[0]).toMatchObject({
      path: 'client-A/conv-1/evo-legacy.ogg',
      contentType: 'audio/ogg',
    })
  })

  it('marks oggTruncated=false when the Evolution buffer contains a trailing OGG EOS page', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const oggBuffer = makeOggBuffer({ eos: true })

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: oggBuffer.toString('base64'),
          mimetype: 'audio/ogg',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'ogg-ok',
      'client-A',
      'conv-1',
      'audio/ogg',
      null,
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/ogg-ok.ogg',
      resolvedMime: 'audio/ogg',
      source: 'evolution',
      oggTruncated: false,
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/ogg-ok.ogg',
      contentType: 'audio/ogg',
      bytes: oggBuffer.length,
    })
    expect(logger).not.toHaveBeenCalledWith(
      'ogg_truncated',
      expect.anything()
    )
  })

  it('marks oggTruncated=true and still uploads playback media when the OGG EOS page is missing', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const oggBuffer = makeOggBuffer({ eos: false })

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: oggBuffer.toString('base64'),
          mimetype: 'audio/ogg',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'ogg-truncated',
      'client-A',
      'conv-1',
      'audio/ogg',
      null,
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/ogg-truncated.ogg',
      resolvedMime: 'audio/ogg',
      source: 'evolution',
      oggTruncated: true,
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/ogg-truncated.ogg',
      contentType: 'audio/ogg',
      bytes: oggBuffer.length,
    })
    expect(logger).toHaveBeenCalledWith(
      'ogg_truncated',
      expect.objectContaining({
        messageId: 'ogg-truncated',
        reason: 'missing_eos_flag',
        bytes: oggBuffer.length,
        firstBytesHex: oggBuffer.subarray(0, 8).toString('hex'),
        lastBytesHex: oggBuffer.subarray(-8).toString('hex'),
      })
    )
  })

  it('does not run OGG truncation validation for non-ogg media types', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const webmBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88])

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          base64: webmBuffer.toString('base64'),
          mimetype: 'audio/webm',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'audio-webm',
      'client-A',
      'conv-1',
      'audio/webm',
      null,
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/audio-webm.webm',
      resolvedMime: 'audio/webm',
      source: 'evolution',
      oggTruncated: false,
    })
    expect(uploads).toContainEqual({
      path: 'client-A/conv-1/audio-webm.webm',
      contentType: 'audio/webm',
      bytes: webmBuffer.length,
    })
    expect(logger).not.toHaveBeenCalledWith(
      'ogg_truncated',
      expect.anything()
    )
  })

  it('skips candidates that return base64 which decodes to an empty buffer', async () => {
    const { admin } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    const logger = vi.fn()
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

    // First candidate: base64 that decodes to 0 bytes (non-base64 chars get stripped → empty).
    // Second candidate (legacy): valid image bytes.
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ base64: '!!!!', mimetype: 'audio/ogg' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ base64: jpegBuffer.toString('base64'), mimetype: 'image/jpeg' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )

    const result = await uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-empty-first',
      'client-A',
      'conv-1',
      'image/jpeg',
      null,
      logger
    )

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-empty-first.jpeg',
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Either the sanitizer rejected the base64 (missing_base64) OR Buffer decoded to 0 bytes
    // (evolution_media_empty_buffer). Both outcomes prove the empty-buffer path is blocked.
    const loggedEvents = logger.mock.calls.map(([evt]) => evt)
    const blockedFirstCandidate =
      loggedEvents.includes('evolution_media_empty_buffer') ||
      loggedEvents.some((evt, i) =>
        evt === 'evolution_media_fetch_failed' &&
        (logger.mock.calls[i]?.[1] as { reason?: string })?.reason === 'missing_base64'
      )
    expect(blockedFirstCandidate).toBe(true)
  })

  it('retries recovery with short backoff before succeeding', async () => {
    vi.useFakeTimers()
    const { admin } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            base64: Buffer.from('eventual-image').toString('base64'),
            mimetype: 'image/jpeg',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )

    const pending = uploadMediaToStorage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-3',
      'client-A',
      'conv-1',
      'image/jpeg'
    )

    await vi.runAllTimersAsync()
    const result = await pending

    expect(result).toMatchObject({
      storagePath: 'client-A/conv-1/evo-3.jpeg',
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://evolution.example/chat/getBase64FromMediaMessage/inst-a')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://evolution.example/message/getBase64FromMediaMessage/inst-a')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://evolution.example/chat/getBase64FromMediaMessage/inst-a')
  })
})
