import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
  uploadMediaToStorage: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/bot/media-storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bot/media-storage')>('@/lib/bot/media-storage')
  return {
    ...actual,
    uploadMediaToStorage: mocks.uploadMediaToStorage,
  }
})

import { GET } from '@/app/api/desk/media/route'

interface MediaMessageRow {
  id: string
  content_type?: string
  evolution_message_id: string | null
  media_url: string | null
  media_mime_type: string | null
  sender_type: string
  from_who: string
}

function buildAdmin(options?: {
  messageByDbId?: MediaMessageRow | null
  messageByMsgId?: MediaMessageRow | null
  signedUrl?: string | null
  downloadByPath?: Record<string, Buffer | null>
  updateError?: { message: string } | null
}) {
  const calls: Array<{ table: string; op: 'update'; payload: Record<string, unknown> }> = []
  const signedUrlCalls: string[] = []
  const downloadCalls: string[] = []

  const admin = {
    from(table: string) {
      if (table === 'conversations') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        client_id: 'client-A',
                        contacts: [{ identifier: '5511999999999@s.whatsapp.net', phone_number: '5511999999999' }],
                        panel_clients: {
                          panel_whatsapp_config: [{ evolution_instance_name: 'inst-a' }],
                        },
                      },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'messages') {
        return {
          select() {
            return {
              eq(key: string) {
                return {
                  async maybeSingle() {
                    const data = key === 'id'
                      ? (options?.messageByDbId ?? null)
                      : (options?.messageByMsgId ?? null)
                    return { data, error: null }
                  },
                }
              },
            }
          },
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                calls.push({ table, op: 'update', payload })
                return Promise.resolve({ data: null, error: options?.updateError ?? null })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
    storage: {
      from() {
        return {
          async createSignedUrl(path: string) {
            signedUrlCalls.push(path)
            if (!options || options.signedUrl === undefined) {
              return { data: { signedUrl: 'https://signed.example/file' }, error: null }
            }
            if (options.signedUrl === null) {
              return { data: null, error: { message: 'signed url failed' } }
            }
            return { data: { signedUrl: options.signedUrl }, error: null }
          },
          async download(path: string) {
            downloadCalls.push(path)
            const buffer = options?.downloadByPath?.[path]
            if (!buffer) {
              return { data: null, error: { message: 'object not found' } }
            }
            return {
              data: {
                async arrayBuffer() {
                  return buffer
                },
              },
              error: null,
            }
          },
        }
      },
    },
  }

  return { admin, calls, signedUrlCalls, downloadCalls }
}

function makeRequest(path: string) {
  return new NextRequest(new Request(`https://panel.example.com${path}`))
}

beforeEach(() => {
  mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
  mocks.uploadMediaToStorage.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/desk/media', () => {
  it('serves stored outbound audio inline by db_msg_id (never redirects audio)', async () => {
    const audioPath = 'client-A/conv-1/out-msg-1.webm'
    const audioBuffer = Buffer.from('outbound-audio-bytes')
    const { admin, signedUrlCalls } = buildAdmin({
      messageByDbId: {
        id: 'msg-1',
        content_type: 'audio',
        evolution_message_id: 'evo-1',
        media_url: audioPath,
        media_mime_type: 'audio/webm;codecs=opus',
        sender_type: 'operator',
        from_who: 'human',
      },
      downloadByPath: { [audioPath]: audioBuffer },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await GET(makeRequest('/api/desk/media?db_msg_id=msg-1&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/webm;codecs=opus')
    expect(Buffer.from(body).length).toBe(audioBuffer.length)
    expect(signedUrlCalls).toHaveLength(0)
    expect(mocks.uploadMediaToStorage).not.toHaveBeenCalled()
  })

  it('redirects a valid stored inbound image without attempting repair', async () => {
    const mediaUrl = 'client-A/conv-1/inbound-valid.jpeg'
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    const { admin, calls, signedUrlCalls, downloadCalls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-img-valid',
        content_type: 'image',
        evolution_message_id: 'evo-img-valid',
        media_url: mediaUrl,
        media_mime_type: 'image/jpeg',
        sender_type: 'contact',
        from_who: 'lead',
      },
      signedUrl: 'https://signed.example/inbound-valid.jpeg',
      downloadByPath: {
        [mediaUrl]: jpegBuffer,
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-img-valid&conversation_id=conv-1'))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://signed.example/inbound-valid.jpeg')
    expect(downloadCalls).toEqual([mediaUrl])
    expect(signedUrlCalls).toEqual([mediaUrl])
    expect(calls).toHaveLength(0)
    expect(mocks.uploadMediaToStorage).not.toHaveBeenCalled()
  })

  it('repairs a corrupted stored inbound image before redirecting', async () => {
    const mediaUrl = 'client-A/conv-1/inbound-corrupted.jpeg'
    const { admin, calls, signedUrlCalls, downloadCalls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-img-bad',
        content_type: 'image',
        evolution_message_id: 'evo-img-bad',
        media_url: mediaUrl,
        media_mime_type: 'image/jpeg',
        sender_type: 'contact',
        from_who: 'lead',
      },
      signedUrl: 'https://signed.example/inbound-repaired.jpeg',
      downloadByPath: {
        [mediaUrl]: Buffer.from('not-an-image'),
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: mediaUrl,
      buffer: Buffer.from('recovered-image'),
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-img-bad&conversation_id=conv-1'))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://signed.example/inbound-repaired.jpeg')
    expect(downloadCalls).toEqual([mediaUrl])
    expect(signedUrlCalls).toEqual([mediaUrl])
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledWith(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-img-bad',
      'client-A',
      'conv-1',
      'image/jpeg',
      null,
      expect.any(Function),
      { fromMe: false, upsert: true }
    )
    expect(calls).toContainEqual({
      table: 'messages',
      op: 'update',
      payload: {
        media_url: mediaUrl,
        media_mime_type: 'image/jpeg',
        media_size_bytes: Buffer.from('recovered-image').length,
      },
    })
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] stored_image_invalid',
      expect.objectContaining({
        conversationId: 'conv-1',
        msgId: 'evo-img-bad',
        mediaUrl,
        error: 'invalid_image_bytes',
      })
    )
  })

  it('returns 404 for db_msg_id without media_url when there is no evolution_message_id to recover', async () => {
    const { admin } = buildAdmin({
      messageByDbId: {
        id: 'msg-1',
        evolution_message_id: null,
        media_url: null,
        media_mime_type: 'audio/webm;codecs=opus',
        sender_type: 'operator',
        from_who: 'human',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await GET(makeRequest('/api/desk/media?db_msg_id=msg-1&conversation_id=conv-1'))

    expect(res.status).toBe(404)
    expect(mocks.uploadMediaToStorage).not.toHaveBeenCalled()
  })

  it('backfills outbound audio db_msg_id and serves inline (never redirects audio)', async () => {
    const recoveredBuffer = Buffer.from('outbound-audio')
    const { admin, calls, signedUrlCalls } = buildAdmin({
      messageByDbId: {
        id: 'msg-1',
        content_type: 'audio',
        evolution_message_id: 'evo-out-1',
        media_url: null,
        media_mime_type: 'audio/webm;codecs=opus',
        sender_type: 'operator',
        from_who: 'human',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: 'client-A/conv-1/evo-out-1.webm',
      buffer: recoveredBuffer,
      resolvedMime: 'audio/webm;codecs=opus',
      source: 'evolution',
    })

    const res = await GET(makeRequest('/api/desk/media?db_msg_id=msg-1&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/webm;codecs=opus')
    expect(Buffer.from(body).length).toBe(recoveredBuffer.length)
    expect(signedUrlCalls).toHaveLength(0)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledTimes(1)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledWith(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-out-1',
      'client-A',
      'conv-1',
      'audio/webm;codecs=opus',
      null,
      expect.any(Function),
      { fromMe: true }
    )
    expect(calls).toContainEqual({
      table: 'messages',
      op: 'update',
      payload: {
        media_url: 'client-A/conv-1/evo-out-1.webm',
        media_mime_type: 'audio/webm;codecs=opus',
        media_size_bytes: recoveredBuffer.length,
      },
    })
  })

  it('backfills inbound audio msg_id into Storage and serves inline (never redirects audio)', async () => {
    const recoveredBuffer = Buffer.from('recovered-audio')
    const { admin, calls, signedUrlCalls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-2',
        content_type: 'audio',
        evolution_message_id: 'evo-2',
        media_url: null,
        media_mime_type: 'audio/ogg',
        sender_type: 'contact',
        from_who: 'lead',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: 'client-A/conv-1/evo-2.ogg',
      buffer: recoveredBuffer,
      resolvedMime: 'audio/ogg',
      source: 'evolution',
    })

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-2&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/ogg')
    expect(Buffer.from(body).length).toBe(recoveredBuffer.length)
    expect(signedUrlCalls).toHaveLength(0)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledTimes(1)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledWith(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-2',
      'client-A',
      'conv-1',
      'audio/ogg',
      null,
      expect.any(Function),
      { fromMe: false }
    )
    expect(calls).toContainEqual({
      table: 'messages',
      op: 'update',
      payload: {
        media_url: 'client-A/conv-1/evo-2.ogg',
        media_mime_type: 'audio/ogg',
        media_size_bytes: recoveredBuffer.length,
      },
    })
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] media_backfill_succeeded',
      expect.objectContaining({
        conversationId: 'conv-1',
        msgId: 'evo-2',
        storagePath: 'client-A/conv-1/evo-2.ogg',
      })
    )
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] audio_inline_served',
      expect.objectContaining({
        conversationId: 'conv-1',
        reason: 'backfill',
      })
    )
  })

  it('backfills inbound image msg_id with sniffed mime and redirects to the repaired signed URL', async () => {
    const { admin, calls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-img',
        evolution_message_id: 'evo-img-1',
        media_url: null,
        media_mime_type: 'application/octet-stream',
        sender_type: 'contact',
        from_who: 'lead',
      },
      signedUrl: 'https://signed.example/recovered.jpeg',
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: 'client-A/conv-1/evo-img-1.jpeg',
      buffer: Buffer.from('recovered-image'),
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-img-1&conversation_id=conv-1'))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://signed.example/recovered.jpeg')
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledWith(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-img-1',
      'client-A',
      'conv-1',
      'application/octet-stream',
      null,
      expect.any(Function),
      { fromMe: false }
    )
    expect(calls).toContainEqual({
      table: 'messages',
      op: 'update',
      payload: {
        media_url: 'client-A/conv-1/evo-img-1.jpeg',
        media_mime_type: 'image/jpeg',
        media_size_bytes: Buffer.from('recovered-image').length,
      },
    })
  })

  it('returns raw recovered media when lazy repair can recover the buffer but not persist Storage', async () => {
    const { admin, calls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-2',
        evolution_message_id: 'evo-2',
        media_url: null,
        media_mime_type: 'audio/ogg',
        sender_type: 'contact',
        from_who: 'lead',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: null,
      buffer: Buffer.from('fallback-audio'),
      resolvedMime: 'audio/ogg',
      source: 'evolution',
    })

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-2&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/ogg')
    expect(body.byteLength).toBeGreaterThan(0)
    expect(calls).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] media_backfill_failed',
      expect.objectContaining({
        conversationId: 'conv-1',
        msgId: 'evo-2',
        error: 'storage_path_missing',
      })
    )
  })

  it('returns raw recovered image when lazy repair can recover the buffer but not persist Storage', async () => {
    const { admin, calls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-img',
        evolution_message_id: 'evo-img-inline',
        media_url: null,
        media_mime_type: 'application/octet-stream',
        sender_type: 'contact',
        from_who: 'lead',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: null,
      buffer: Buffer.from('inline-image'),
      resolvedMime: 'image/jpeg',
      source: 'evolution',
    })

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-img-inline&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(body.byteLength).toBe(Buffer.from('inline-image').length)
    expect(calls).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] media_inline_served',
      expect.objectContaining({
        conversationId: 'conv-1',
        msgId: 'evo-img-inline',
        resolvedMime: 'image/jpeg',
        source: 'evolution',
        reason: 'storage_unavailable_after_recovery',
      })
    )
  })

  it('stored inbound audio with signed URL never called — always inline', async () => {
    const audioPath = 'client-A/conv-1/in-evo-stored.ogg'
    const audioBuffer = Buffer.from('stored-inbound-audio')
    const { admin, signedUrlCalls } = buildAdmin({
      messageByMsgId: {
        id: 'msg-stored',
        content_type: 'audio',
        evolution_message_id: 'evo-stored',
        media_url: audioPath,
        media_mime_type: 'audio/ogg; codecs=opus',
        sender_type: 'contact',
        from_who: 'lead',
      },
      downloadByPath: { [audioPath]: audioBuffer },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-stored&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/ogg; codecs=opus')
    expect(Buffer.from(body).length).toBe(audioBuffer.length)
    expect(signedUrlCalls).toHaveLength(0)
    expect(mocks.uploadMediaToStorage).not.toHaveBeenCalled()
  })

  it('tries lazy repair after storage download failure for inbound audio and returns 404 when recovery also fails', async () => {
    const { admin } = buildAdmin({
      messageByMsgId: {
        id: 'msg-2',
        content_type: 'audio',
        evolution_message_id: 'evo-2',
        media_url: 'client-A/conv-1/in-evo-2.ogg',
        media_mime_type: 'audio/ogg',
        sender_type: 'contact',
        from_who: 'lead',
      },
      // downloadByPath not set → download returns error
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: null,
      buffer: null,
      resolvedMime: 'audio/ogg',
      source: null,
    })

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-2&conversation_id=conv-1'))

    expect(res.status).toBe(404)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledTimes(1)
  })

  it('tries lazy repair for outbound db_msg_id and returns 404 when recovery also fails', async () => {
    const { admin } = buildAdmin({
      messageByDbId: {
        id: 'msg-1',
        evolution_message_id: 'evo-out-1',
        media_url: null,
        media_mime_type: 'audio/webm;codecs=opus',
        sender_type: 'operator',
        from_who: 'human',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: null,
      buffer: null,
      resolvedMime: 'audio/webm;codecs=opus',
      source: null,
    })

    const res = await GET(makeRequest('/api/desk/media?db_msg_id=msg-1&conversation_id=conv-1'))

    expect(res.status).toBe(404)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledTimes(1)
    expect(mocks.uploadMediaToStorage).toHaveBeenCalledWith(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'evo-out-1',
      'client-A',
      'conv-1',
      'audio/webm;codecs=opus',
      null,
      expect.any(Function),
      { fromMe: true }
    )
  })
})
