// Regression test: dispatcher must NOT call clearAiPause when the agent
// short-circuited because the conversation was already paused by a human
// operator (output.debug.notes === 'ai_paused').
//
// Without the guard in dispatcher.ts:224, every incoming webhook on a
// paused conversation would silently delete the operator's lock, defeating
// the P1.1 fix in the desk message route.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendTextMessage: vi.fn(),
  sendMediaByUrl: vi.fn(),
  handleAgendaCheck: vi.fn(),
  handleAgendaCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  sendTextMessage: mocks.sendTextMessage,
  sendMediaByUrl: mocks.sendMediaByUrl,
}))

vi.mock('@/lib/bot/calendar-agent', () => ({
  handleAgendaCheck: mocks.handleAgendaCheck,
  handleAgendaCreate: mocks.handleAgendaCreate,
}))

import { dispatch } from '@/lib/bot/dispatcher'
import { fallbackOutput } from '@/lib/bot/output-schema'
import type { PipelineResult } from '@/lib/bot/pipeline'

/** Minimal PipelineResult — only the fields dispatch actually reads. */
function makeResult(): PipelineResult {
  return {
    clientContext: {
      clientId: 'client-A',
      botConfig: null,
      googleConfig: null,
      whatsappConfig: {
        evolution_instance_name: 'inst-a',
      },
    },
    contact: {
      id: 'contact-1',
      name: 'Tester',
      phone_number: '5511999999999',
      identifier: '5511999999999@s.whatsapp.net',
    },
    conversation: {
      id: 'conv-1',
      client_id: 'client-A',
      stage: 'bot_triage',
      status: 'open',
      labels: [],
    },
    message: null,
    messageHistory: [],
  } as unknown as PipelineResult
}

interface CapturedOp {
  table: string
  op: 'delete' | 'update' | 'upsert' | 'insert'
  filter?: { key: string; value: unknown }
}

function buildAdmin() {
  const ops: CapturedOp[] = []

  function table(name: string) {
    return {
      select() {
        return {
          eq() {
            return { async single() { return { data: null, error: null } } }
          },
        }
      },
      update(payload: unknown) {
        void payload
        return {
          eq(key: string, value: unknown) {
            ops.push({ table: name, op: 'update', filter: { key, value } })
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
      insert(payload: unknown) {
        void payload
        ops.push({ table: name, op: 'insert' })
        return { select() { return { async single() { return { data: { id: 'msg-1' }, error: null } } } } }
      },
      upsert(payload: unknown) {
        void payload
        ops.push({ table: name, op: 'upsert' })
        return Promise.resolve({ data: null, error: null })
      },
      delete() {
        return {
          eq(key: string, value: unknown) {
            ops.push({ table: name, op: 'delete', filter: { key, value } })
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    }
  }

  return { admin: { from: (name: string) => table(name) }, ops }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.sendTextMessage.mockResolvedValue(undefined)
  mocks.sendMediaByUrl.mockResolvedValue(undefined)
  mocks.handleAgendaCheck.mockResolvedValue(undefined)
  mocks.handleAgendaCreate.mockResolvedValue(undefined)
})

describe('dispatch — ai_pause guard', () => {
  it('REGRESSION: does NOT call clearAiPause when output.debug.notes === "ai_paused"', async () => {
    const { admin, ops } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)

    const pausedOutput = {
      ...fallbackOutput,
      debug: { ...fallbackOutput.debug, notes: 'ai_paused' as const },
    }

    await dispatch(makeResult(), pausedOutput as never)

    const pauseDeletes = ops.filter((o) => o.table === 'ai_pauses' && o.op === 'delete')
    expect(pauseDeletes).toHaveLength(0)
  })

  it('DOES call clearAiPause when output.debug.notes is "parse_error" (normal bot reply path)', async () => {
    const { admin, ops } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)

    // fallbackOutput has notes: 'parse_error' — simulates a normal (non-paused) dispatch
    await dispatch(makeResult(), fallbackOutput as never)

    const pauseDeletes = ops.filter((o) => o.table === 'ai_pauses' && o.op === 'delete')
    expect(pauseDeletes).toHaveLength(1)
    expect(pauseDeletes[0].filter).toEqual({ key: 'conversation_id', value: 'conv-1' })
  })

  it('emits a single [Dispatcher] warn when clientContext.botConfig is null', async () => {
    const { admin } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // makeResult() already returns botConfig: null
    await dispatch(makeResult(), fallbackOutput as never)

    const dispatcherWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].startsWith('[Dispatcher] sem panel_bot_config')
    )
    expect(dispatcherWarns).toHaveLength(1)
    expect(dispatcherWarns[0][1]).toMatchObject({
      clientId: 'client-A',
      conversationId: 'conv-1',
    })
  })

  it('DOES call clearAiPause when notes is null (successful agent output)', async () => {
    const { admin, ops } = buildAdmin()
    mocks.createAdminClient.mockReturnValue(admin)

    const normalOutput = {
      ...fallbackOutput,
      debug: { ...fallbackOutput.debug, notes: null },
    }

    await dispatch(makeResult(), normalOutput as never)

    const pauseDeletes = ops.filter((o) => o.table === 'ai_pauses' && o.op === 'delete')
    expect(pauseDeletes).toHaveLength(1)
  })
})
