import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
  emitConversationEvent: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/desk/emit-conversation-event', () => ({
  emitConversationEvent: mocks.emitConversationEvent,
}))

function buildAdmin() {
  const calls: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = []

  return {
    calls,
    admin: {
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
                          contact_id: 'contact-1',
                          followup_cadence: 'lead',
                        },
                        error: null,
                      }
                    },
                  }
                },
              }
            },
            update(payload: Record<string, unknown>) {
              calls.push({ table, op: 'update', payload })
              return {
                eq() {
                  return Promise.resolve({ data: null, error: null })
                },
              }
            },
          }
        }

        if (table === 'followup_cadence_suppressions') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            is() {
                              return {
                                async maybeSingle() {
                                  return { data: null, error: null }
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
            },
            insert(payload: Record<string, unknown>) {
              calls.push({ table, op: 'insert', payload })
              return Promise.resolve({ data: null, error: null })
            },
          }
        }

        if (table === 'followup_logs') {
          return {
            insert(payload: Record<string, unknown>) {
              calls.push({ table, op: 'insert', payload })
              return Promise.resolve({ data: null, error: null })
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('POST /api/followups/[conversationId]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'op-1',
      clientId: 'client-1',
      isAdmin: false,
    })
    mocks.emitConversationEvent.mockResolvedValue(undefined)
  })

  it('creates a suppression, logs the cancel and clears the active cadence', async () => {
    const { admin, calls } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)
    const { POST } = await import('@/app/api/followups/[conversationId]/cancel/route')

    const response = await POST(
      new NextRequest(
        new Request('https://panel.example.com/api/followups/conv-1/cancel', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cadence_type: 'lead' }),
        })
      ),
      { params: Promise.resolve({ conversationId: 'conv-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      suppressed: true,
      already_suppressed: false,
    })

    expect(calls.find((call) => call.table === 'followup_cadence_suppressions' && call.op === 'insert')?.payload)
      .toMatchObject({
        conversation_id: 'conv-1',
        client_id: 'client-1',
        cadence_type: 'lead',
        suppressed_by: 'op-1',
      })

    expect(calls.find((call) => call.table === 'followup_logs' && call.op === 'insert')?.payload).toMatchObject({
      conversation_id: 'conv-1',
      contact_id: 'contact-1',
      step_name: 'manual_cancel',
    })

    expect(calls.find((call) => call.table === 'conversations' && call.op === 'update')?.payload).toEqual({
      followup_cadence: null,
    })

    expect(mocks.emitConversationEvent).toHaveBeenCalledWith(
      'conv-1',
      'client-1',
      'followup_cancelled',
      'operator',
      { cadence_type: 'lead' },
      'op-1'
    )
  })
})
