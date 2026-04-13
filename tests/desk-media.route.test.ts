import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { GET } from '@/app/api/desk/media/route'

interface MediaMessageRow {
  id: string
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
}) {
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
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
    storage: {
      from() {
        return {
          async createSignedUrl() {
            if (!options || options.signedUrl === undefined) {
              return { data: { signedUrl: 'https://signed.example/file' }, error: null }
            }
            if (options.signedUrl === null) {
              return { data: null, error: { message: 'signed url failed' } }
            }
            return { data: { signedUrl: options.signedUrl }, error: null }
          },
        }
      },
    },
  }

  return { admin }
}

function makeRequest(path: string) {
  return new NextRequest(new Request(`https://panel.example.com${path}`))
}

beforeEach(() => {
  mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
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

describe('GET /api/desk/media', () => {
  it('redirects outbound operator media by db_msg_id when Storage is available', async () => {
    const { admin } = buildAdmin({
      messageByDbId: {
        id: 'msg-1',
        evolution_message_id: 'evo-1',
        media_url: 'client-A/conv-1/out-msg-1.webm',
        media_mime_type: 'audio/webm;codecs=opus',
        sender_type: 'operator',
        from_who: 'human',
      },
      signedUrl: 'https://signed.example/outbound.webm',
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await GET(makeRequest('/api/desk/media?db_msg_id=msg-1&conversation_id=conv-1'))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://signed.example/outbound.webm')
  })

  it('returns functional 404 for outbound db_msg_id without media_url and logs the cause', async () => {
    const { admin } = buildAdmin({
      messageByDbId: {
        id: 'msg-1',
        evolution_message_id: 'evo-1',
        media_url: null,
        media_mime_type: 'audio/webm;codecs=opus',
        sender_type: 'operator',
        from_who: 'human',
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await GET(makeRequest('/api/desk/media?db_msg_id=msg-1&conversation_id=conv-1'))

    expect(res.status).toBe(404)
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] db_msg_without_media_url',
      expect.objectContaining({
        conversationId: 'conv-1',
        dbMsgId: 'msg-1',
        senderType: 'operator',
      })
    )
  })

  it('tries Evolution after signed URL failure for inbound msg_id and returns 404 when Evolution also fails', async () => {
    const { admin } = buildAdmin({
      messageByMsgId: {
        id: 'msg-2',
        evolution_message_id: 'evo-2',
        media_url: 'client-A/conv-1/in-evo-2.ogg',
        media_mime_type: 'audio/ogg',
        sender_type: 'contact',
        from_who: 'lead',
      },
      signedUrl: null,
    })
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-2&conversation_id=conv-1'))

    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/media] signed_url_failed',
      expect.objectContaining({
        conversationId: 'conv-1',
        msgId: 'evo-2',
      })
    )
  })

  it('falls back to Evolution for inbound msg_id when Storage is unavailable', async () => {
    const { admin } = buildAdmin({
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
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
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

    const res = await GET(makeRequest('/api/desk/media?msg_id=evo-2&conversation_id=conv-1'))
    const body = await res.arrayBuffer()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/ogg')
    expect(body.byteLength).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
