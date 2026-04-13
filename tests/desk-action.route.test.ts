import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  applyRateLimit: vi.fn(),
  createAdminClient: vi.fn(),
  emitConversationEvent: vi.fn(),
  resumeConversationFromDesk: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
  applyRateLimit: mocks.applyRateLimit,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/desk/emit-conversation-event', () => ({
  emitConversationEvent: mocks.emitConversationEvent,
}))

vi.mock('@/lib/bot/resume-from-desk', () => ({
  resumeConversationFromDesk: mocks.resumeConversationFromDesk,
}))

function buildAdmin(stage = 'in_service') {
  const calls: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = []

  const admin = {
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
                        stage,
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
                return {
                  select() {
                    return {
                      async single() {
                        return { data: { stage: payload.stage }, error: null }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'ai_pauses') {
        return {
          upsert(payload: Record<string, unknown>) {
            calls.push({ table, op: 'upsert', payload })
            return Promise.resolve({ data: null, error: null })
          },
          delete() {
            return {
              eq() {
                calls.push({ table, op: 'delete' })
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return { admin, calls }
}

function makeRequest(action: 'assume' | 'return' | 'resolve') {
  return new NextRequest(new Request('https://panel.example.com/api/desk/conversations/conv-1/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.applyRateLimit.mockReturnValue(null)
  mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-1', isAdmin: false })
  mocks.emitConversationEvent.mockResolvedValue(undefined)
  mocks.resumeConversationFromDesk.mockResolvedValue({ attempted: true, triggered: true, reason: 'triggered' })
})

describe('POST /api/desk/conversations/[id]/action', () => {
  it('return keeps the public response shape and triggers async bot replay', async () => {
    const { admin, calls } = buildAdmin('in_service')
    mocks.createAdminClient.mockReturnValue(admin)

    const { POST } = await import('@/app/api/desk/conversations/[id]/action/route')
    const response = await POST(makeRequest('return'), { params: Promise.resolve({ id: 'conv-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      action: 'return',
      stage: 'bot_triage',
    })
    expect(mocks.resumeConversationFromDesk).toHaveBeenCalledWith('conv-1', {
      triggeredBy: 'op-1',
      previousStage: 'in_service',
    })
    expect(calls.some((call) => call.table === 'ai_pauses' && call.op === 'delete')).toBe(true)
  })

  it('assume pauses the bot and does not trigger replay', async () => {
    const { admin, calls } = buildAdmin('awaiting_human')
    mocks.createAdminClient.mockReturnValue(admin)

    const { POST } = await import('@/app/api/desk/conversations/[id]/action/route')
    const response = await POST(makeRequest('assume'), { params: Promise.resolve({ id: 'conv-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      action: 'assume',
      stage: 'in_service',
    })
    expect(calls.some((call) => call.table === 'ai_pauses' && call.op === 'upsert')).toBe(true)
    expect(mocks.resumeConversationFromDesk).not.toHaveBeenCalled()
  })

  it('resolve finalizes the conversation without replaying the bot', async () => {
    const { admin, calls } = buildAdmin('in_service')
    mocks.createAdminClient.mockReturnValue(admin)

    const { POST } = await import('@/app/api/desk/conversations/[id]/action/route')
    const response = await POST(makeRequest('resolve'), { params: Promise.resolve({ id: 'conv-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      action: 'resolve',
      stage: 'resolved',
    })
    expect(calls.some((call) => call.table === 'ai_pauses' && call.op === 'delete')).toBe(true)
    expect(mocks.resumeConversationFromDesk).not.toHaveBeenCalled()
  })
})
