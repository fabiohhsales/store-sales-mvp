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
  it('prefers the direct mediaUrl when it is still available', async () => {
    const { admin, uploads } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(Buffer.from('image-bytes'), {
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
      bytes: Buffer.from('image-bytes').length,
    })
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
    expect(uploads[0]).toMatchObject({
      path: 'client-A/conv-1/evo-2.ogg',
      contentType: 'audio/ogg',
    })
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
  })
})
