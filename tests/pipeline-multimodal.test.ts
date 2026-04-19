import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uploadMediaToStorage: vi.fn(),
  processDownloadedMultimodalMessage: vi.fn(),
}))

vi.mock('@/lib/bot/media-storage', () => ({
  uploadMediaToStorage: mocks.uploadMediaToStorage,
}))

vi.mock('@/lib/bot/multimodal', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bot/multimodal')>('@/lib/bot/multimodal')
  return {
    ...actual,
    processDownloadedMultimodalMessage: mocks.processDownloadedMultimodalMessage,
  }
})

import { saveEvolutionMessage } from '@/lib/bot/pipeline'
import type { BotConversation, NormalizedEvolutionMessage } from '@/types/bot'

interface MessageRow {
  id: string
  evolution_message_id: string
  conversation_id: string
  client_id: string
  content: string | null
  content_type: string
  sender_type: string
  from_who: string
  created_at: string
  raw_payload?: unknown
  derived_text?: string | null
  derived_kind?: string | null
  processing_status?: string | null
  processing_error?: string | null
  ai_input_text?: string | null
  media_url?: string | null
  media_mime_type?: string | null
  media_size_bytes?: number | null
  sent_to_agent_at?: string | null
  [extra: string]: unknown
}

function buildSupabase(opts: {
  initial?: MessageRow[]
  updateError?: { message: string } | null
} = {}) {
  const rows: MessageRow[] = [...(opts.initial ?? [])]
  const insertCalls: Array<Record<string, unknown>> = []
  const updateCalls: Array<{ filter: { key: string; value: unknown }; payload: Record<string, unknown> }> = []

  const supabase = {
    from(table: string) {
      if (table !== 'messages') {
        throw new Error(`Unexpected table in test: ${table}`)
      }

      return {
        select() {
          return {
            eq(key: string, value: unknown) {
              const found = rows.find((row) => row[key] === value)
              return {
                async maybeSingle() {
                  return { data: found ?? null, error: null }
                },
                async single() {
                  return found
                    ? { data: found, error: null }
                    : { data: null, error: { code: 'PGRST116', message: 'No rows' } }
                },
              }
            },
          }
        },
        insert(payload: Record<string, unknown>) {
          insertCalls.push(structuredClone(payload))
          return {
            select() {
              return {
                async single() {
                  const row = structuredClone(payload) as MessageRow
                  rows.push(row)
                  return { data: row, error: null }
                },
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            async eq(key: string, value: unknown) {
              updateCalls.push({ filter: { key, value }, payload })
              const target = rows.find((row) => row[key] === value)

              if (target && !opts.updateError) {
                Object.assign(target, payload)
              }

              return {
                data: opts.updateError ? null : (target ?? null),
                error: opts.updateError ?? null,
              }
            },
          }
        },
      }
    },
  }

  return { supabase, rows, insertCalls, updateCalls }
}

function makeConversation(): BotConversation {
  return {
    id: 'conv-1',
    client_id: 'client-1',
    contact_id: 'contact-1',
    status: 'open',
    stage: 'bot_triage',
    labels: ['etapa_triagem'],
    last_incoming_at: '2026-04-16T12:00:00Z',
  } as unknown as BotConversation
}

function makeImageMessage(): NormalizedEvolutionMessage {
  return {
    instanceName: 'inst-1',
    remoteJid: '5511999999999@s.whatsapp.net',
    phoneNumber: '5511999999999',
    contactName: 'Paciente',
    messageId: 'evo-img-1',
    content: '[Imagem]',
    contentType: 'image',
    timestamp: new Date('2026-04-16T12:00:00Z'),
    mediaUrl: 'https://example.com/image.jpg',
    mediaMimetype: 'image/jpeg',
    mediaDuration: null,
    mediaWidth: 1200,
    mediaHeight: 800,
    mediaFilename: null,
    rawPayload: {
      event: 'messages.upsert',
      instance: 'inst-1',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: 'evo-img-1',
        },
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            url: 'https://example.com/image.jpg',
          },
        },
        messageTimestamp: 1713268800,
      },
    },
  }
}

function makeAudioMessage(): NormalizedEvolutionMessage {
  return {
    instanceName: 'inst-1',
    remoteJid: '5511999999999@s.whatsapp.net',
    phoneNumber: '5511999999999',
    contactName: 'Paciente',
    messageId: 'evo-audio-1',
    content: '[Ãudio]',
    contentType: 'audio',
    timestamp: new Date('2026-04-16T12:00:00Z'),
    mediaUrl: 'https://example.com/audio.ogg',
    mediaMimetype: 'audio/ogg',
    mediaDuration: 14,
    mediaWidth: null,
    mediaHeight: null,
    mediaFilename: 'audio.ogg',
    rawPayload: {
      event: 'messages.upsert',
      instance: 'inst-1',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: 'evo-audio-1',
        },
        message: {
          audioMessage: {
            mimetype: 'audio/ogg',
            url: 'https://example.com/audio.ogg',
          },
        },
        messageTimestamp: 1713268800,
      },
    },
  }
}

describe('saveEvolutionMessage — multimodal persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('persists raw payload and multimodal derived fields when image processing succeeds', async () => {
    const { supabase, insertCalls, updateCalls } = buildSupabase()

    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: 'client-1/conv-1/evo-img-1.jpeg',
      buffer: Buffer.from('image-bytes'),
      resolvedMime: 'image/jpeg',
    })
    mocks.processDownloadedMultimodalMessage.mockResolvedValue({
      provider: 'openai',
      derivedText: 'Exame fotografado com texto legível.',
      derivedKind: 'vision_analysis',
      aiInputText: 'Descrição da imagem enviada pelo contato: Exame fotografado com texto legível.',
      mediaTranscript: null,
      processingStatus: 'processed',
      processingError: null,
    })

    const result = await saveEvolutionMessage(
      supabase as never,
      makeImageMessage(),
      makeConversation(),
      'client-1'
    )

    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toMatchObject({
      evolution_message_id: 'evo-img-1',
      conversation_id: 'conv-1',
      client_id: 'client-1',
      content: '[Imagem]',
      content_type: 'image',
      raw_payload: expect.objectContaining({ event: 'messages.upsert', instance: 'inst-1' }),
      derived_text: null,
      derived_kind: null,
      processing_status: 'received',
      processing_error: null,
      ai_input_text: null,
      sent_to_agent_at: null,
    })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toMatchObject({
      filter: { key: 'id', value: insertCalls[0].id },
      payload: expect.objectContaining({
        media_url: 'client-1/conv-1/evo-img-1.jpeg',
        media_mime_type: 'image/jpeg',
        media_size_bytes: 11,
        media_width: 1200,
        media_height: 800,
        derived_text: 'Exame fotografado com texto legível.',
        derived_kind: 'vision_analysis',
        processing_status: 'processed',
        processing_error: null,
        ai_input_text: 'Descrição da imagem enviada pelo contato: Exame fotografado com texto legível.',
      }),
    })

    expect(result).toMatchObject({
      media_url: 'client-1/conv-1/evo-img-1.jpeg',
      media_mime_type: 'image/jpeg',
      media_size_bytes: 11,
      derived_text: 'Exame fotografado com texto legível.',
      derived_kind: 'vision_analysis',
      processing_status: 'processed',
      processing_error: null,
      ai_input_text: 'Descrição da imagem enviada pelo contato: Exame fotografado com texto legível.',
    })
  })

  it('does not mutate the in-memory message as processed when the multimodal update fails', async () => {
    const { supabase, insertCalls, updateCalls } = buildSupabase({
      updateError: { message: 'db write failed' },
    })

    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: 'client-1/conv-1/evo-img-1.jpeg',
      buffer: Buffer.from('image-bytes'),
      resolvedMime: 'image/jpeg',
    })
    mocks.processDownloadedMultimodalMessage.mockResolvedValue({
      provider: 'openai',
      derivedText: 'Exame fotografado com texto legível.',
      derivedKind: 'vision_analysis',
      aiInputText: 'Descrição da imagem enviada pelo contato: Exame fotografado com texto legível.',
      mediaTranscript: null,
      processingStatus: 'processed',
      processingError: null,
    })

    const result = await saveEvolutionMessage(
      supabase as never,
      makeImageMessage(),
      makeConversation(),
      'client-1'
    )

    expect(updateCalls).toHaveLength(1)
    expect(result.id).toBe(insertCalls[0].id)
    expect(result.media_url).toBeUndefined()
    expect(result.derived_text).toBeNull()
    expect(result.derived_kind).toBeNull()
    expect(result.processing_status).toBe('received')
    expect(result.processing_error).toBeNull()
    expect(result.ai_input_text).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      '[multimodal] multimodal_failed',
      expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'evo-img-1',
        contentType: 'image',
        processing_status: 'failed',
        processing_error: 'message_update_failed',
        update_error: 'db write failed',
        last_processing_status: 'processed',
      })
    )
  })

  it('preserves playback media fields when audio transcription fails', async () => {
    const { supabase, updateCalls } = buildSupabase()

    mocks.uploadMediaToStorage.mockResolvedValue({
      storagePath: 'client-1/conv-1/evo-audio-1.ogg',
      buffer: Buffer.from('audio-bytes'),
      resolvedMime: 'audio/ogg',
    })
    mocks.processDownloadedMultimodalMessage.mockResolvedValue({
      provider: 'openai',
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'audio_conversion_binary_unavailable',
    })

    const result = await saveEvolutionMessage(
      supabase as never,
      makeAudioMessage(),
      makeConversation(),
      'client-1'
    )

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.payload).toMatchObject({
      media_url: 'client-1/conv-1/evo-audio-1.ogg',
      media_mime_type: 'audio/ogg',
      media_filename: 'audio.ogg',
      media_duration_seconds: 14,
      media_size_bytes: 11,
      processing_status: 'failed',
      processing_error: 'audio_conversion_binary_unavailable',
      derived_text: null,
      derived_kind: null,
      ai_input_text: null,
    })
    expect(result).toMatchObject({
      media_url: 'client-1/conv-1/evo-audio-1.ogg',
      media_mime_type: 'audio/ogg',
      media_filename: 'audio.ogg',
      media_duration_seconds: 14,
      media_size_bytes: 11,
      processing_status: 'failed',
      processing_error: 'audio_conversion_binary_unavailable',
      derived_text: null,
      derived_kind: null,
      ai_input_text: null,
    })
    expect(result.media_transcript).toBeUndefined()
  })
})
