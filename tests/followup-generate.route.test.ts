import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
  createAiClient: vi.fn(),
  createCompletion: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/ai/client', () => ({
  AI_MODEL_MINI: 'gpt-test-mini',
  createAiClient: mocks.createAiClient,
}))

function buildAdmin() {
  return {
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
                        client_id: 'client-1',
                        contacts: [{ name: 'Maria', phone_number: '5511999999999' }],
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

      if (table === 'panel_bot_config') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        professional_name: 'Dra. Clara',
                        business_name: 'Clinica Clara',
                        ai_tone: 'professional_friendly',
                        ai_language: 'pt-BR',
                        ai_custom_instructions: 'Seja breve.',
                        process_flow_guide: 'Foque em reagendamento.',
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
              eq() {
                return {
                  order() {
                    return {
                      async limit() {
                        return {
                          data: [
                            {
                              content: 'Oi, posso te ajudar?',
                              content_type: 'text',
                              media_transcript: null,
                              from_who: 'ai',
                              sender_type: 'agent_bot',
                              created_at: '2026-04-19T10:00:00Z',
                            },
                            {
                              content: 'Quero remarcar minha consulta.',
                              content_type: 'text',
                              media_transcript: null,
                              from_who: 'lead',
                              sender_type: 'lead',
                              created_at: '2026-04-19T10:05:00Z',
                            },
                          ],
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('POST /api/followups/[conversationId]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'op-1',
      clientId: 'client-1',
      isAdmin: false,
    })
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Oi Maria! Posso te ajudar a remarcar sua consulta?' } }],
    })
    mocks.createAiClient.mockReturnValue({
      chat: {
        completions: {
          create: mocks.createCompletion,
        },
      },
    })
  })

  it('generates a follow-up preview using bot config and message history', async () => {
    const { POST } = await import('@/app/api/followups/[conversationId]/generate/route')

    const response = await POST(
      new NextRequest(
        new Request('https://panel.example.com/api/followups/conv-1/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            instruction: 'Retome a conversa com foco em reagendamento',
            cadence_type: 'atendimento',
          }),
        })
      ),
      { params: Promise.resolve({ conversationId: 'conv-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      message: 'Oi Maria! Posso te ajudar a remarcar sua consulta?',
    })
    expect(mocks.createCompletion).toHaveBeenCalledOnce()
  })
})
