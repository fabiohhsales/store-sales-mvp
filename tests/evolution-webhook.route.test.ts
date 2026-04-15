import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncConnectionStateFromWebhook: vi.fn(),
  normalizeEvolutionPayload: vi.fn(),
  runEvolutionPipeline: vi.fn(),
  runConversationBotTurn: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/whatsapp/connection-state', () => ({
  syncConnectionStateFromWebhook: mocks.syncConnectionStateFromWebhook,
}))

vi.mock('@/lib/bot/normalize-evolution', () => ({
  normalizeEvolutionPayload: mocks.normalizeEvolutionPayload,
}))

vi.mock('@/lib/bot/pipeline', () => ({
  runEvolutionPipeline: mocks.runEvolutionPipeline,
}))

vi.mock('@/lib/bot/run-conversation-turn', () => ({
  runConversationBotTurn: mocks.runConversationBotTurn,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

describe('POST /api/webhooks/evolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sincroniza connection.update sem debounce funcional', async () => {
    const { POST } = await import('@/app/api/webhooks/evolution/route')
    const response = await POST({
      json: async () => ({
        event: 'connection.update',
        instance: 'clinic-instance',
        state: 'connecting',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(mocks.syncConnectionStateFromWebhook).toHaveBeenCalledWith('clinic-instance', 'connecting')
  })

  it('processa messages.upsert pelo helper compartilhado de turno', async () => {
    vi.useFakeTimers()

    const pipelineResult = {
      clientContext: {
        clientId: 'client-1',
        whatsappConfig: { evolution_instance_name: 'inst-1' },
        botConfig: { stage_labels: [] },
        googleConfig: null,
      },
      contact: {
        id: 'contact-1',
        name: 'Paciente',
        phone_number: '5511999999999',
        identifier: '5511999999999@s.whatsapp.net',
      },
      conversation: {
        id: 'conv-1',
        client_id: 'client-1',
        stage: 'bot_triage',
      },
      message: {
        id: 'msg-1',
        content: 'Olá',
      },
      messageHistory: [],
    }

    mocks.normalizeEvolutionPayload.mockReturnValue({
      instanceName: 'inst-1',
      remoteJid: '5511999999999@s.whatsapp.net',
      phoneNumber: '5511999999999',
      contactName: 'Paciente',
      messageId: 'EVO-1',
      content: 'Olá',
      contentType: 'text',
      timestamp: new Date('2026-04-08T12:00:00Z'),
      mediaUrl: null,
      mediaMimetype: null,
      mediaDuration: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaFilename: null,
    })
    mocks.runEvolutionPipeline.mockResolvedValue(pipelineResult)
    mocks.runConversationBotTurn.mockResolvedValue({ attempted: true, sent: true, reason: null })
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table !== 'messages') {
          throw new Error(`Unexpected table: ${table}`)
        }
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gt() {
                        return Promise.resolve({ count: 0, error: null })
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
    })

    const { POST } = await import('@/app/api/webhooks/evolution/route')
    const response = await POST({
      json: async () => ({
        event: 'messages.upsert',
        instance: 'inst-1',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'EVO-1' },
          pushName: 'Paciente',
          message: { conversation: 'Olá' },
          messageTimestamp: 1_712_560_800,
        },
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(mocks.runEvolutionPipeline).toHaveBeenCalledTimes(1)

    await vi.runAllTimersAsync()
    await Promise.resolve()

    expect(mocks.runConversationBotTurn).toHaveBeenCalledWith(pipelineResult)
  })

  it('atualiza whatsapp_status quando a Evolution envia ack de audio outbound', async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table !== 'messages') {
          throw new Error(`Unexpected table: ${table}`)
        }
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(field: string, value: string) {
                updateEq(field, value, payload)
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    })

    const { POST } = await import('@/app/api/webhooks/evolution/route')
    const response = await POST({
      json: async () => ({
        event: 'messages.update',
        instance: 'inst-1',
        data: [
          {
            key: {
              remoteJid: '5511999999999@s.whatsapp.net',
              fromMe: true,
              id: 'evo-audio-1',
            },
            update: {
              status: 5,
            },
          },
        ],
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(updateEq).toHaveBeenCalledWith(
      'evolution_message_id',
      'evo-audio-1',
      { whatsapp_status: 'played' }
    )
  })
})
