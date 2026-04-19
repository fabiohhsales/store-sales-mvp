import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Evolution API wrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
    delete process.env.EVOLUTION_API_URL
    delete process.env.EVOLUTION_API_KEY
  })

  it('uses the dedicated WhatsApp audio endpoint and payload for sendAudioMessage', async () => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example'
    process.env.EVOLUTION_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: { id: 'audio-msg-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { sendAudioMessage } = await import('@/lib/api/evolution')
    const result = await sendAudioMessage(
      'inst-a',
      '5511999999999@s.whatsapp.net',
      'audio/webm;codecs=opus',
      'YmFzZTY0LWF1ZGlv',
      'caption ignorada',
      'audio.webm'
    )

    expect(result).toBe('audio-msg-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://evolution.example/message/sendWhatsAppAudio/inst-a')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: 'test-key',
      },
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      number: '5511999999999@s.whatsapp.net',
      audio: 'YmFzZTY0LWF1ZGlv',
    })
  })
})
