import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createAdminClient: vi.fn(),
  updateConversationLabels: vi.fn(),
}))

vi.mock('@/lib/auth/embed-token', () => ({
  authenticateRequest: mocks.authenticateRequest,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/chatwoot', () => ({
  updateConversationLabels: mocks.updateConversationLabels,
}))

function buildAdminClient(options?: {
  labels?: string[]
  conversationLabels?: string[]
  chatwootConversationId?: number | null
}) {
  const stageLabels = options?.labels ?? ['etapa_triagem', 'etapa_qualificacao', 'etapa_agendando']
  let updatePayload: Record<string, unknown> | null = null

  const admin = {
    from(table: string) {
      if (table === 'panel_bot_config') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        stage_labels: stageLabels.map((slug) => ({ slug, display_name: slug })),
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

      if (table === 'conversations') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            id: 'conv-1',
                            labels: options?.conversationLabels ?? ['vip', 'etapa_triagem', 'manual_tag'],
                            chatwoot_conversation_id: options?.chatwootConversationId ?? null,
                          },
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
          update(payload: Record<string, unknown>) {
            updatePayload = payload
            return {
              async eq() {
                return { error: null }
              },
            }
          },
        }
      }

      if (table === 'panel_whatsapp_config' || table === 'panel_clients') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null }
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

  return { admin, getUpdatePayload: () => updatePayload }
}

describe('POST /api/pipeline/move', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.authenticateRequest.mockResolvedValue({ client_id: 'client-1' })
    mocks.updateConversationLabels.mockResolvedValue(undefined)
  })

  it('persiste stage e labels consistentes ao mover card', async () => {
    const client = buildAdminClient()
    mocks.createAdminClient.mockReturnValue(client.admin)

    const { POST } = await import('@/app/api/pipeline/move/route')

    const response = await POST({
      json: async () => ({
        client_id: 'client-1',
        conversation_id: 'conv-1',
        from_stage: 'etapa_triagem',
        to_stage: 'etapa_qualificacao',
      }),
    } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      stage: 'etapa_qualificacao',
      labels: ['vip', 'manual_tag', 'etapa_qualificacao'],
    })

    expect(client.getUpdatePayload()).toEqual({
      labels: ['vip', 'manual_tag', 'etapa_qualificacao'],
      stage: 'etapa_qualificacao',
    })
  })

  it('retorna 400 quando to_stage não é válido para o cliente', async () => {
    const client = buildAdminClient()
    mocks.createAdminClient.mockReturnValue(client.admin)

    const { POST } = await import('@/app/api/pipeline/move/route')

    const response = await POST({
      json: async () => ({
        client_id: 'client-1',
        conversation_id: 'conv-1',
        from_stage: 'etapa_triagem',
        to_stage: 'etapa_inexistente',
      }),
    } as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'to_stage inválido para o cliente',
    })

    expect(client.getUpdatePayload()).toBeNull()
  })
})
