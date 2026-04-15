import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  applyRateLimit: vi.fn(),
  createAdminClient: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendAudioMessage: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
  applyRateLimit: mocks.applyRateLimit,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  sendMediaMessage: mocks.sendMediaMessage,
  sendAudioMessage: mocks.sendAudioMessage,
}))

import { POST } from '@/app/api/desk/conversations/[id]/send-media/route'

interface CapturedCall {
  table: string
  op: 'insert' | 'update'
  payload: Record<string, unknown>
}

function buildAdmin(options?: {
  stage?: string
  uploadErrorMessage?: string | null
  insertError?: { message: string } | null
}) {
  const calls: CapturedCall[] = []
  const uploads: Array<{ path: string; contentType: string | undefined; bytes: number }> = []

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
                        id: 'conv-1',
                        client_id: 'client-A',
                        stage: options?.stage ?? 'in_service',
                        contacts: [{ phone_number: '5511999999999', identifier: '5511999999999@s.whatsapp.net' }],
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
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                calls.push({ table, op: 'update', payload })
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      }

      if (table === 'messages') {
        return {
          insert(payload: Record<string, unknown>) {
            calls.push({ table, op: 'insert', payload })
            return {
              select() {
                return {
                  async single() {
                    if (options?.insertError) {
                      return { data: null, error: options.insertError }
                    }
                    return { data: { ...payload }, error: null }
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

  return { admin, calls, uploads }
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    new Request('https://panel.example.com/api/desk/conversations/conv-1/send-media', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  )
}

const params = Promise.resolve({ id: 'conv-1' })

beforeEach(() => {
  mocks.applyRateLimit.mockReturnValue(null)
  mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
  mocks.sendMediaMessage.mockResolvedValue('evo-media-1')
  mocks.sendAudioMessage.mockResolvedValue('evo-audio-1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/desk/conversations/[id]/send-media', () => {
  it('uses sendAudioMessage for audio payloads and persists audio metadata', async () => {
    const { admin, calls, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const audioBuffer = Buffer.from('audio-bytes')

    const res = await POST(
      makeRequest({
        base64: audioBuffer.toString('base64'),
        mimetype: 'audio/webm;codecs=opus',
        file_name: 'voice-note.webm',
      }),
      { params }
    )

    expect(res.status).toBe(200)
    expect(mocks.sendAudioMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendAudioMessage).toHaveBeenCalledWith(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'audio/webm;codecs=opus',
      audioBuffer.toString('base64'),
      undefined,
      'voice-note.webm'
    )
    expect(mocks.sendMediaMessage).not.toHaveBeenCalled()
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toMatchObject({
      contentType: 'audio/webm;codecs=opus',
      bytes: audioBuffer.length,
    })

    const insertCall = calls.find((call) => call.table === 'messages' && call.op === 'insert')
    expect(insertCall?.payload).toMatchObject({
      content_type: 'audio',
      evolution_message_id: 'evo-audio-1',
      media_mime_type: 'audio/webm;codecs=opus',
      media_filename: 'voice-note.webm',
      media_size_bytes: audioBuffer.length,
    })
    expect(typeof insertCall?.payload.media_url).toBe('string')
  })

  it('uses sendMediaMessage for non-audio payloads', async () => {
    const { admin, calls } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const imageBuffer = Buffer.from('image-bytes')

    const res = await POST(
      makeRequest({
        base64: imageBuffer.toString('base64'),
        mimetype: 'image/png',
        file_name: 'photo.png',
      }),
      { params }
    )

    expect(res.status).toBe(200)
    expect(mocks.sendMediaMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendAudioMessage).not.toHaveBeenCalled()

    const insertCall = calls.find((call) => call.table === 'messages' && call.op === 'insert')
    expect(insertCall?.payload).toMatchObject({
      content_type: 'image',
      evolution_message_id: 'evo-media-1',
    })
  })

  it('keeps the 50 MB real-file limit contract', async () => {
    const overLimitBase64 = Buffer.alloc(50 * 1024 * 1024 + 1).toString('base64')

    const res = await POST(
      makeRequest({
        base64: overLimitBase64,
        mimetype: 'application/pdf',
        file_name: 'large.pdf',
      }),
      { params }
    )

    expect(res.status).toBe(413)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.sendMediaMessage).not.toHaveBeenCalled()
    expect(mocks.sendAudioMessage).not.toHaveBeenCalled()
  })

  it('does not persist success when Evolution rejects the outbound send', async () => {
    const { admin, calls } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.sendMediaMessage.mockRejectedValue(new Error('provider down'))

    const res = await POST(
      makeRequest({
        base64: Buffer.from('doc-bytes').toString('base64'),
        mimetype: 'application/pdf',
        file_name: 'contract.pdf',
      }),
      { params }
    )

    expect(res.status).toBe(502)
    expect(calls.find((call) => call.table === 'messages' && call.op === 'insert')).toBeUndefined()
  })

  it('persists degraded outbound media when Evolution succeeds and Storage fails', async () => {
    const { admin, calls } = buildAdmin({ uploadErrorMessage: 'storage unavailable' })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await POST(
      makeRequest({
        base64: Buffer.from('doc-bytes').toString('base64'),
        mimetype: 'application/pdf',
        file_name: 'contract.pdf',
      }),
      { params }
    )

    expect(res.status).toBe(200)
    const insertCall = calls.find((call) => call.table === 'messages' && call.op === 'insert')
    expect(insertCall?.payload).toMatchObject({
      media_url: null,
      evolution_message_id: 'evo-media-1',
      media_filename: 'contract.pdf',
    })
    expect(console.warn).toHaveBeenCalledWith(
      '[desk/send-media] persisted without storage fallback:',
      expect.objectContaining({
        mediatype: 'document',
        mimetype: 'application/pdf',
        error: 'storage unavailable',
      })
    )
  })
})
