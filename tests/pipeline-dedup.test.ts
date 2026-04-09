// Dedup + concurrency tests for saveEvolutionMessage in src/lib/bot/pipeline.ts.
// Covers:
//   1. Duplicate webhook in the same conversation -> returns existing, no write.
//   2. Duplicate webhook in a different conversation of the SAME client -> migrates.
//   3. Cross-tenant collision (different client_id) -> MUST NOT migrate (P0 guard).
//   4. Race on insert: unique-constraint 23505 -> fallback SELECT returns existing.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Stub the storage upload so image/document branch is a no-op.
vi.mock('@/lib/bot/media-storage', () => ({
  uploadMediaToStorage: vi.fn().mockResolvedValue(null),
}))

import { saveEvolutionMessage } from '@/lib/bot/pipeline'
import type { BotConversation } from '@/types/bot'

interface MessageRow {
  id: string
  evolution_message_id: string
  conversation_id: string
  client_id: string
  content: string
  content_type: string
  sender_type: string
  from_who: string
  created_at: string
  // Allow our in-memory fake to do generic key lookups via [key] indexing.
  [extra: string]: unknown
}

/**
 * Builds an in-memory Supabase-shaped client that supports exactly the
 * query shapes saveEvolutionMessage uses:
 *   - from('messages').select('*').eq('evolution_message_id', id).maybeSingle()
 *   - from('messages').select('*').eq('evolution_message_id', id).single()
 *   - from('messages').insert({...}).select().single()
 *   - from('messages').update({...}).eq('evolution_message_id', id).select().single()
 */
function buildSupabase(opts: {
  initial?: MessageRow[]
  insertError?: { code: string; message: string } | null
} = {}) {
  const rows: MessageRow[] = [...(opts.initial ?? [])]
  const insertCalls: Array<Record<string, unknown>> = []
  const updateCalls: Array<{ filter: { key: string; value: unknown }; payload: Record<string, unknown> }> = []
  const selectCalls: Array<{ key: string; value: unknown }> = []

  function messagesTable() {
    return {
      select() {
        return {
          eq(key: string, value: unknown) {
            selectCalls.push({ key, value })
            const found = rows.find((r) => (r as Record<string, unknown>)[key] === value)
            return {
              async maybeSingle() {
                return { data: found ?? null, error: null }
              },
              async single() {
                return found
                  ? { data: found, error: null }
                  : { data: null, error: { code: 'PGRST116', message: 'No rows' } }
              },
            }
          },
        }
      },
      insert(payload: Record<string, unknown>) {
        insertCalls.push(payload)
        return {
          select() {
            return {
              async single() {
                if (opts.insertError) {
                  return { data: null, error: opts.insertError }
                }
                const row = payload as unknown as MessageRow
                rows.push(row)
                return { data: row, error: null }
              },
            }
          },
        }
      },
      update(payload: Record<string, unknown>) {
        return {
          eq(key: string, value: unknown) {
            updateCalls.push({ filter: { key, value }, payload })
            const target = rows.find((r) => (r as Record<string, unknown>)[key] === value)
            if (target) Object.assign(target, payload)
            return {
              select() {
                return {
                  async single() {
                    return target
                      ? { data: target, error: null }
                      : { data: null, error: { message: 'not found' } }
                  },
                }
              },
            }
          },
        }
      },
    }
  }

  const supabase = {
    from(table: string) {
      if (table !== 'messages') {
        throw new Error(`Unexpected table in test: ${table}`)
      }
      return messagesTable()
    },
  }

  return { supabase, rows, insertCalls, updateCalls, selectCalls }
}

function makeMsg(overrides: Partial<{
  messageId: string
  content: string
  contentType: 'text' | 'image' | 'document'
}> = {}) {
  return {
    messageId: overrides.messageId ?? 'EVO-MSG-1',
    instanceName: 'inst-a',
    remoteJid: '5511999999999@s.whatsapp.net',
    content: overrides.content ?? 'Hello',
    contentType: overrides.contentType ?? 'text',
    timestamp: new Date('2026-04-08T12:00:00Z'),
    pushName: 'Tester',
  } as const
}

function makeConv(id: string, clientId: string): BotConversation {
  return {
    id,
    client_id: clientId,
    contact_id: 'contact-1',
    status: 'open',
    stage: 'bot_triage',
    labels: ['lead_novo'],
    last_incoming_at: '2026-04-08T12:00:00Z',
  } as unknown as BotConversation
}

function makeRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: overrides.id ?? 'existing-row-1',
    evolution_message_id: overrides.evolution_message_id ?? 'EVO-MSG-1',
    conversation_id: overrides.conversation_id ?? 'conv-old',
    client_id: overrides.client_id ?? 'client-A',
    content: overrides.content ?? 'Hello',
    content_type: overrides.content_type ?? 'text',
    sender_type: overrides.sender_type ?? 'contact',
    from_who: overrides.from_who ?? 'lead',
    created_at: overrides.created_at ?? '2026-04-08T11:59:00Z',
  }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('saveEvolutionMessage — dedup', () => {
  it('returns the existing row without inserting when the message already exists in the same conversation', async () => {
    const existing = makeRow({ conversation_id: 'conv-1', client_id: 'client-A' })
    const { supabase, insertCalls, updateCalls } = buildSupabase({ initial: [existing] })
    const conv = makeConv('conv-1', 'client-A')

    const result = await saveEvolutionMessage(
      supabase as never,
      makeMsg() as never,
      conv,
      'client-A'
    )

    expect(result.id).toBe(existing.id)
    expect(insertCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(0)
  })

  it('migrates a message to the current conversation when it previously lived in a different conversation of the SAME client', async () => {
    const existing = makeRow({ conversation_id: 'conv-old', client_id: 'client-A' })
    const { supabase, insertCalls, updateCalls } = buildSupabase({ initial: [existing] })
    const conv = makeConv('conv-new', 'client-A')

    const result = await saveEvolutionMessage(
      supabase as never,
      makeMsg() as never,
      conv,
      'client-A'
    )

    expect(insertCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].filter).toEqual({ key: 'evolution_message_id', value: 'EVO-MSG-1' })
    expect(updateCalls[0].payload).toMatchObject({
      conversation_id: 'conv-new',
      client_id: 'client-A',
    })
    expect(result.conversation_id).toBe('conv-new')
  })

  it('REFUSES to migrate a message across tenants (cross-client collision is a P0 guard)', async () => {
    const existing = makeRow({ conversation_id: 'conv-A', client_id: 'client-A' })
    const { supabase, insertCalls, updateCalls } = buildSupabase({ initial: [existing] })
    const conv = makeConv('conv-B', 'client-B')

    const result = await saveEvolutionMessage(
      supabase as never,
      makeMsg() as never,
      conv,
      'client-B' // different tenant!
    )

    // Must return the existing row untouched. Must NOT update conversation_id or client_id.
    expect(insertCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(0)
    expect(result.client_id).toBe('client-A')
    expect(result.conversation_id).toBe('conv-A')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Cross-tenant'),
      expect.objectContaining({
        existingClientId: 'client-A',
        incomingClientId: 'client-B',
      })
    )
  })

  it('recovers via fallback SELECT when INSERT races and hits a unique-constraint violation (23505)', async () => {
    // No initial row -> first dedup SELECT returns null -> code proceeds to
    // INSERT -> we make the INSERT fail with 23505 -> fallback SELECT must
    // find the row that another concurrent writer inserted in between. We
    // simulate that by seeding the row AFTER the dedup SELECT but BEFORE
    // the INSERT; simplest way: pre-seed and have the dedup SELECT skip it.
    //
    // Here we fake it by building a supabase whose initial-rows are empty
    // for the first SELECT (so dedup misses), insert errors with 23505,
    // and the fallback SELECT finds a row we inject on the second call.
    const state = buildSupabase({
      insertError: { code: '23505', message: 'duplicate key' },
    })

    // Inject the "concurrent winner" row so the fallback SELECT after
    // the 23505 can find it. The dedup SELECT at the very top of
    // saveEvolutionMessage WILL also see it — and in that case the
    // function returns via the "exists in same conversation" branch,
    // skipping the insert entirely. To exercise the 23505 path we need
    // the row to appear ONLY after the dedup check. We wrap the table
    // to count SELECT calls and only return the row from the 2nd one.

    let selectCount = 0
    const winnerRow = makeRow({ conversation_id: 'conv-1', client_id: 'client-A' })
    const supabase = {
      from(table: string) {
        if (table !== 'messages') throw new Error(`unexpected ${table}`)
        return {
          select() {
            return {
              eq(_key: string, _value: unknown) {
                selectCount += 1
                const firstCall = selectCount === 1
                return {
                  async maybeSingle() {
                    return { data: firstCall ? null : winnerRow, error: null }
                  },
                  async single() {
                    return firstCall
                      ? { data: null, error: { code: 'PGRST116' } }
                      : { data: winnerRow, error: null }
                  },
                }
              },
            }
          },
          insert(_payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } }
                  },
                }
              },
            }
          },
        }
      },
    }

    const conv = makeConv('conv-1', 'client-A')
    const result = await saveEvolutionMessage(
      supabase as never,
      makeMsg() as never,
      conv,
      'client-A'
    )

    expect(result.id).toBe(winnerRow.id)
    expect(selectCount).toBeGreaterThanOrEqual(2)
    // silence unused-var warning from state
    expect(state.insertCalls).toBeDefined()
  })
})
