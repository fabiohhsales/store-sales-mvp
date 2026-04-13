// Tests for POST /api/desk/conversations/[id]/message — focus on the
// human-takeover ai_pause renewal contract: every operator message must
// renew paused_until, regardless of conversation stage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
  sendTextMessage: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
  applyRateLimit: vi.fn(() => null),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  sendTextMessage: mocks.sendTextMessage,
}))

import { POST } from '@/app/api/desk/conversations/[id]/message/route'

interface ConvShape {
  id: string
  client_id: string
  stage: string
  status: string
}

interface CapturedCall {
  table: string
  op: 'upsert' | 'update' | 'insert'
  payload: Record<string, unknown>
  filter?: { key: string; value: unknown }
}

function buildAdmin(opts: { conv: ConvShape | null }) {
  const calls: CapturedCall[] = []

  function table(name: string) {
    return {
      select(_cols: string) {
        return {
          eq(_key: string, _value: unknown) {
            return {
              async maybeSingle() {
                if (!opts.conv) return { data: null, error: null }
                return {
                  data: {
                    id: opts.conv.id,
                    client_id: opts.conv.client_id,
                    stage: opts.conv.stage,
                    status: opts.conv.status,
                    contacts: [{ phone_number: '5511999999999', identifier: '5511999999999@s.whatsapp.net' }],
                    panel_clients: {
                      panel_whatsapp_config: [{ evolution_instance_name: 'inst-a' }],
                    },
                  },
                  error: null,
                }
              },
            }
          },
        }
      },
      upsert(payload: Record<string, unknown>) {
        calls.push({ table: name, op: 'upsert', payload })
        return Promise.resolve({ data: null, error: null })
      },
      insert(payload: Record<string, unknown>) {
        calls.push({ table: name, op: 'insert', payload })
        return {
          select() {
            return {
              async single() {
                return {
                  data: { id: 'msg-1', ...payload },
                  error: null,
                }
              },
            }
          },
        }
      },
      update(payload: Record<string, unknown>) {
        return {
          eq(key: string, value: unknown) {
            calls.push({ table: name, op: 'update', payload, filter: { key, value } })
            // Mutate the conv to simulate the stage flip taking effect.
            if (name === 'conversations' && opts.conv && key === 'id' && value === opts.conv.id) {
              if (typeof payload.stage === 'string') opts.conv.stage = payload.stage
            }
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    }
  }

  return {
    admin: { from: (name: string) => table(name) },
    calls,
  }
}

function makeRequest(body: unknown = { content: 'olá' }) {
  return new NextRequest(
    new Request('https://panel.example.com/api/desk/conversations/conv-1/message', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  )
}

const params = Promise.resolve({ id: 'conv-1' })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.sendTextMessage.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/desk/conversations/[id]/message', () => {
  it('returns 401 when no desk user is resolved (no DB writes)', async () => {
    mocks.resolveDeskUser.mockResolvedValue(null)
    const { admin, calls } = buildAdmin({
      conv: { id: 'conv-1', client_id: 'client-A', stage: 'in_service', status: 'open' },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })

  it('returns 403 when a non-admin desk user belongs to a different client (no DB writes)', async () => {
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'op-1',
      clientId: 'client-B',
      isAdmin: false,
    })
    const { admin, calls } = buildAdmin({
      conv: { id: 'conv-1', client_id: 'client-A', stage: 'bot_triage', status: 'open' },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(403)
    // Only the SELECT happened; no upsert/update/insert.
    expect(calls.filter((c) => c.op !== 'insert' && c.op !== 'upsert' && c.op !== 'update')).toHaveLength(0)
    expect(calls).toHaveLength(0)
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })

  it('on first message of a bot_triage conversation: upserts ai_pauses AND flips stage to in_service', async () => {
    mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
    const { admin, calls } = buildAdmin({
      conv: { id: 'conv-1', client_id: 'client-A', stage: 'bot_triage', status: 'open' },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(200)

    const pauseUpserts = calls.filter((c) => c.table === 'ai_pauses' && c.op === 'upsert')
    expect(pauseUpserts).toHaveLength(1)
    expect(pauseUpserts[0].payload).toMatchObject({
      conversation_id: 'conv-1',
      paused_reason: 'operator_assumed',
      paused_by: 'op-1',
    })

    const stageUpdates = calls.filter(
      (c) => c.table === 'conversations' && c.op === 'update' && (c.payload as { stage?: string }).stage === 'in_service'
    )
    expect(stageUpdates).toHaveLength(1)
  })

  it('REGRESSION (P1.1): on a conversation already in_service, an operator message STILL renews ai_pauses', async () => {
    mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
    const { admin, calls } = buildAdmin({
      conv: { id: 'conv-1', client_id: 'client-A', stage: 'in_service', status: 'open' },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(200)

    const pauseUpserts = calls.filter((c) => c.table === 'ai_pauses' && c.op === 'upsert')
    expect(pauseUpserts).toHaveLength(1) // <-- this is the renewal that the old code skipped

    // Stage must NOT be re-flipped to in_service (the conversation already is).
    const stageReflips = calls.filter(
      (c) => c.table === 'conversations' && c.op === 'update' && (c.payload as { stage?: string }).stage === 'in_service'
    )
    expect(stageReflips).toHaveLength(0)
  })

  it('persiste o evolution_message_id retornado por sendTextMessage', async () => {
    mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
    mocks.sendTextMessage.mockResolvedValue('EVO-TEXT-1')
    const { admin, calls } = buildAdmin({
      conv: { id: 'conv-1', client_id: 'client-A', stage: 'in_service', status: 'open' },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    const res = await POST(makeRequest({ content: 'olá' }), { params })
    expect(res.status).toBe(200)

    const messageInsert = calls.find((c) => c.table === 'messages' && c.op === 'insert')
    expect(messageInsert?.payload).toMatchObject({
      evolution_message_id: 'EVO-TEXT-1',
      content: 'olá',
      from_who: 'human',
    })
  })

  it('two consecutive operator messages on an in_service conversation produce two upserts with strictly increasing paused_until', async () => {
    mocks.resolveDeskUser.mockResolvedValue({ userId: 'op-1', clientId: 'client-A', isAdmin: false })
    const { admin, calls } = buildAdmin({
      conv: { id: 'conv-1', client_id: 'client-A', stage: 'in_service', status: 'open' },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'))
    await POST(makeRequest({ content: 'first' }), { params })

    vi.setSystemTime(new Date('2026-04-08T12:30:00Z'))
    await POST(makeRequest({ content: 'second' }), { params })

    const pauseUpserts = calls.filter((c) => c.table === 'ai_pauses' && c.op === 'upsert')
    expect(pauseUpserts).toHaveLength(2)
    const first = new Date(pauseUpserts[0].payload.paused_until as string).getTime()
    const second = new Date(pauseUpserts[1].payload.paused_until as string).getTime()
    expect(second).toBeGreaterThan(first)
    expect(second - first).toBe(30 * 60 * 1000) // exactly 30 minutes apart
  })
})
