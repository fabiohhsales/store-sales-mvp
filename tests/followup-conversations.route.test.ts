import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createAdminClient: vi.fn(),
  getSuppressedConversations: vi.fn(),
  resolveLeadSteps: vi.fn(),
  resolveAtendimentoSteps: vi.fn(),
  resolveAgendadoSteps: vi.fn(),
}))

vi.mock('@/lib/auth/embed-token', () => ({
  authenticateRequest: mocks.authenticateRequest,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/followup/shared', () => ({
  getSuppressedConversations: mocks.getSuppressedConversations,
  resolveLeadSteps: mocks.resolveLeadSteps,
  resolveAtendimentoSteps: mocks.resolveAtendimentoSteps,
  resolveAgendadoSteps: mocks.resolveAgendadoSteps,
}))

function buildAdmin() {
  return {
    from(table: string) {
      if (table === 'panel_bot_config') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: 'bot-1' }, error: null }
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
                  or() {
                    return {
                      not() {
                        return {
                          async limit() {
                            return {
                              data: [
                                {
                                  id: 'conv-1',
                                  client_id: 'client-1',
                                  contact_id: 'contact-1',
                                  followup_cadence: 'lead',
                                  last_incoming_at: '2026-04-19T09:00:00Z',
                                  last_outgoing_at: '2026-04-19T10:00:00Z',
                                  stage: 'bot_triage',
                                  status: 'open',
                                  contacts: [{ name: 'Maria', phone_number: '5511999991111' }],
                                },
                                {
                                  id: 'conv-2',
                                  client_id: 'client-1',
                                  contact_id: 'contact-2',
                                  followup_cadence: 'lead',
                                  last_incoming_at: '2026-04-19T11:00:00Z',
                                  last_outgoing_at: '2026-04-19T10:30:00Z',
                                  stage: 'in_service',
                                  status: 'open',
                                  contacts: [{ name: 'Joao', phone_number: '5511999992222' }],
                                },
                                {
                                  id: 'conv-3',
                                  client_id: 'client-1',
                                  contact_id: 'contact-3',
                                  followup_cadence: 'atendimento',
                                  last_incoming_at: null,
                                  last_outgoing_at: '2026-04-19T08:30:00Z',
                                  stage: 'awaiting_human',
                                  status: 'open',
                                  contacts: [{ name: 'Ana', phone_number: '5511999993333' }],
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
          },
        }
      }

      if (table === 'followup_cadence_steps') {
        return {
          select() {
            return {
              in() {
                return {
                  order() {
                    return {
                      async limit() {
                        return {
                          data: [
                            {
                              conversation_id: 'conv-1',
                              cadence_type: 'lead',
                              step_key: 'lead_D2',
                              sent_at: '2026-04-19T10:00:00Z',
                              message_sent: 'Mensagem D2',
                            },
                            {
                              conversation_id: 'conv-1',
                              cadence_type: 'lead',
                              step_key: 'lead_D1',
                              sent_at: '2026-04-18T10:00:00Z',
                              message_sent: 'Mensagem D1',
                            },
                            {
                              conversation_id: 'conv-2',
                              cadence_type: 'lead',
                              step_key: 'lead_D1',
                              sent_at: '2026-04-19T10:30:00Z',
                              message_sent: 'Mensagem Joao',
                            },
                            {
                              conversation_id: 'conv-3',
                              cadence_type: 'atendimento',
                              step_key: 'atendimento_D1',
                              sent_at: '2026-04-19T08:30:00Z',
                              message_sent: 'Mensagem Ana',
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

describe('GET /api/followups/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({
      client_id: 'client-1',
      authenticated: true,
      source: 'session',
      role: 'admin',
    })
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.getSuppressedConversations.mockImplementation(async (_clientId: string, cadence: string) => {
      if (cadence === 'atendimento') return new Set(['conv-3'])
      return new Set()
    })
    mocks.resolveLeadSteps.mockReturnValue([
      { step_key: 'lead_D1', label: 'D+1' },
      { step_key: 'lead_D2', label: 'D+2' },
    ])
    mocks.resolveAtendimentoSteps.mockReturnValue([{ step_key: 'atendimento_D1', label: 'D+1' }])
    mocks.resolveAgendadoSteps.mockReturnValue([{ step_key: 'agendado_-3h', label: '-3h' }])
  })

  it('returns active conversations with derived current step and tree counts', async () => {
    const { GET } = await import('@/app/api/followups/conversations/route')
    const request = new NextRequest(
      new Request(
        'https://panel.example.com/api/followups/conversations?client_id=client-1&status=all&page=1&per_page=20'
      )
    )

    const response = await GET(request)
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      summary: { totalActive: number; filteredTotal: number }
      tree: Array<{ cadence: string; count: number; steps: Array<{ step_key: string; count: number }> }>
      conversations: Array<{ conversation_id: string; current_step: string; current_step_label: string }>
    }

    expect(body.summary.totalActive).toBe(2)
    expect(body.summary.filteredTotal).toBe(2)
    expect(body.conversations[0]).toMatchObject({
      conversation_id: 'conv-2',
      current_step: 'lead_D1',
      current_step_label: 'D+1',
    })
    expect(body.conversations[1]).toMatchObject({
      conversation_id: 'conv-1',
      current_step: 'lead_D2',
      current_step_label: 'D+2',
    })
    expect(body.tree.find((node) => node.cadence === 'lead')).toMatchObject({
      count: 2,
      steps: expect.arrayContaining([
        expect.objectContaining({ step_key: 'lead_D1', count: 1 }),
        expect.objectContaining({ step_key: 'lead_D2', count: 1 }),
      ]),
    })
  })
})
