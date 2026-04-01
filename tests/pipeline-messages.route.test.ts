import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/auth/embed-token', () => ({
  authenticateRequest: mocks.authenticateRequest,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

function buildAdminClient(options: {
  conversationClientId?: string | null
  messages?: Array<Record<string, unknown>>
}) {
  const messages = options.messages ?? [
    { id: 'm1', content: 'Oi', from_who: 'human', created_at: '2026-01-01T10:00:00Z' },
  ]

  return {
    from(table: string) {
      if (table === 'conversations') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    if (options.conversationClientId === null) {
                      return { data: null, error: null }
                    }
                    return {
                      data: {
                        id: 'conv-1',
                        client_id: options.conversationClientId ?? 'client-1',
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
                        return { data: messages, error: null }
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

describe('GET /api/pipeline/messages', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({
      client_id: 'client-1',
      authenticated: true,
      source: 'session',
      role: 'admin',
    })
  })

  it('retorna 403 quando a conversa pertence a outro cliente', async () => {
    mocks.createAdminClient.mockReturnValue(
      buildAdminClient({ conversationClientId: 'client-2' })
    )

    const { GET } = await import('@/app/api/pipeline/messages/route')

    const response = await GET({
      nextUrl: new URL('https://panel.example.com/api/pipeline/messages?client_id=client-1&conversation_id=conv-1'),
    } as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Acesso negado para esta conversa',
    })
  })

  it('retorna mensagens quando a conversa pertence ao cliente autenticado', async () => {
    mocks.createAdminClient.mockReturnValue(
      buildAdminClient({ conversationClientId: 'client-1' })
    )

    const { GET } = await import('@/app/api/pipeline/messages/route')

    const response = await GET({
      nextUrl: new URL('https://panel.example.com/api/pipeline/messages?client_id=client-1&conversation_id=conv-1'),
    } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      { id: 'm1', content: 'Oi', from_who: 'human', created_at: '2026-01-01T10:00:00Z' },
    ])
  })
})
