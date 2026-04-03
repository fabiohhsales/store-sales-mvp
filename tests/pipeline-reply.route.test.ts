import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createAdminClient: vi.fn(),
  sendTextMessage: vi.fn(),
  updateConversationLabels: vi.fn(),
}))

vi.mock('@/lib/auth/embed-token', () => ({
  authenticateRequest: mocks.authenticateRequest,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  sendTextMessage: mocks.sendTextMessage,
}))

vi.mock('@/lib/api/chatwoot', () => ({
  updateConversationLabels: mocks.updateConversationLabels,
}))

function buildAdminClient(options?: {
  conversationLabels?: string[]
  stageLabels?: string[]
}) {
  const stageLabels = options?.stageLabels ?? ['etapa_triagem', 'etapa_qualificacao']
  let updatePayload: Record<string, unknown> | null = null
  let messageInsertCount = 0

  const admin = {
    from(table: string) {
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
                            client_id: 'client-1',
                            contact_id: 'contact-1',
                            labels: options?.conversationLabels ?? ['vip', 'etapa_triagem'],
                            chatwoot_conversation_id: null,
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

      if (table === 'contacts') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        identifier: '5511999999999@s.whatsapp.net',
                        phone_number: '5511999999999',
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

      if (table === 'panel_whatsapp_config') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        evolution_instance_name: 'inst-1',
                        chatwoot_account_id: null,
                        chatwoot_agent_token: null,
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

      if (table === 'messages') {
        return {
          insert() {
            messageInsertCount += 1
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'msg-1',
                        content: 'Olá',
                        from_who: 'human',
                        created_at: '2026-04-02T12:00:00Z',
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

      if (table === 'panel_clients') {
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

  return {
    admin,
    getUpdatePayload: () => updatePayload,
    getMessageInsertCount: () => messageInsertCount,
  }
}

describe('POST /api/pipeline/reply', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.authenticateRequest.mockResolvedValue({
      client_id: 'client-1',
      authenticated: true,
      source: 'session',
      role: 'admin',
    })
    mocks.sendTextMessage.mockResolvedValue(undefined)
    mocks.updateConversationLabels.mockResolvedValue(undefined)
  })

  it('aceita _sem_etapa e remove a label de funil da conversa', async () => {
    const client = buildAdminClient()
    mocks.createAdminClient.mockReturnValue(client.admin)

    const { POST } = await import('@/app/api/pipeline/reply/route')

    const response = await POST({
      json: async () => ({
        client_id: 'client-1',
        conversation_id: 'conv-1',
        content: 'Olá',
        auto_move_enabled: true,
        auto_move_to_stage: '_sem_etapa',
      }),
    } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: 'msg-1',
      content: 'Olá',
    })

    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(client.getUpdatePayload()).toMatchObject({
      labels: ['vip'],
      last_outgoing_by: 'operator',
    })
  })

  it('valida auto_move_to_stage antes de enviar a mensagem', async () => {
    const client = buildAdminClient()
    mocks.createAdminClient.mockReturnValue(client.admin)

    const { POST } = await import('@/app/api/pipeline/reply/route')

    const response = await POST({
      json: async () => ({
        client_id: 'client-1',
        conversation_id: 'conv-1',
        content: 'Olá',
        auto_move_enabled: true,
        auto_move_to_stage: 'etapa_inexistente',
      }),
    } as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'auto_move_to_stage inválido para o cliente',
    })

    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
    expect(client.getMessageInsertCount()).toBe(0)
    expect(client.getUpdatePayload()).toBeNull()
  })
})
