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
  owned: boolean
  exists?: boolean
}) {
  return {
    from(table: string) {
      if (table !== 'appointments') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select(selection?: string) {
          const isOwnershipQuery = typeof selection === 'string' && selection.includes('conversations!inner')

          if (isOwnershipQuery) {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: options.owned ? { id: 'apt-1' } : null,
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          }

          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: options.exists === false ? null : { id: 'apt-1' },
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
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: { id: 'apt-1', status: payload.status },
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
    },
  }
}

describe('PATCH /api/agenda/[id]/status', () => {
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

  it('retorna 403 quando o agendamento não pertence ao cliente autenticado', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdminClient({ owned: false, exists: true }))

    const { PATCH } = await import('@/app/api/agenda/[id]/status/route')
    const response = await PATCH(
      {
        json: async () => ({
          client_id: 'client-1',
          status: 'attended',
        }),
      } as never,
      { params: Promise.resolve({ id: 'apt-1' }) }
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Acesso negado para este agendamento',
    })
  })

  it('atualiza status quando o agendamento pertence ao cliente autenticado', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdminClient({ owned: true }))

    const { PATCH } = await import('@/app/api/agenda/[id]/status/route')
    const response = await PATCH(
      {
        json: async () => ({
          client_id: 'client-1',
          status: 'attended',
        }),
      } as never,
      { params: Promise.resolve({ id: 'apt-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: 'apt-1',
      status: 'attended',
    })
  })
})
