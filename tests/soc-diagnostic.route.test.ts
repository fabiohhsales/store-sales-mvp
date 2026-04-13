import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveSessionRoleContext: vi.fn(),
  createClient: vi.fn(),
  getConnectionState: vi.fn(),
}))

vi.mock('@/lib/auth/request-context', () => ({
  resolveSessionRoleContext: mocks.resolveSessionRoleContext,
  isAuthError: (err: unknown) => !!(err && typeof err === 'object' && 'status' in err),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  getConnectionState: mocks.getConnectionState,
}))

function makeQuery(
  resolver: {
    list: (filters: Array<{ op: string; key: string; value: unknown }>) => {
      data: unknown
      error: null
      count?: number
    }
    single?: (filters: Array<{ op: string; key: string; value: unknown }>) => {
      data: unknown
      error: null
      count?: number
    }
  }
) {
  const filters: Array<{ op: string; key: string; value: unknown }> = []
  const query: any = {
    select() {
      return query
    },
    eq(key: string, value: unknown) {
      filters.push({ op: 'eq', key, value })
      return query
    },
    neq(key: string, value: unknown) {
      filters.push({ op: 'neq', key, value })
      return query
    },
    in(key: string, value: unknown) {
      filters.push({ op: 'in', key, value })
      return query
    },
    not(key: string, value: unknown, value2?: unknown) {
      filters.push({ op: 'not', key, value: [value, value2] })
      return query
    },
    lt(key: string, value: unknown) {
      filters.push({ op: 'lt', key, value })
      return query
    },
    gte(key: string, value: unknown) {
      filters.push({ op: 'gte', key, value })
      return query
    },
    order() {
      return query
    },
    limit() {
      return query
    },
    maybeSingle() {
      const fn = resolver.single ?? resolver.list
      return Promise.resolve(fn(filters))
    },
    then(resolve: (value: { data: unknown; error: null; count?: number }) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(resolver.list(filters)).then(resolve, reject)
    },
  }
  return query
}

function buildClient() {
  const activeClients = [
    {
      id: 'client-ok',
      name: 'Clínica A',
      status: 'active',
      panel_whatsapp_config: {
        evolution_instance_name: 'inst-ok',
        connected_phone: '5511999999999',
        webhook_url: 'https://panel.example.com/api/webhooks/evolution/inst-ok',
      },
      panel_google_config: {
        google_email: 'a@example.com',
      },
      panel_bot_config: {
        professional_name: 'Dra. A',
      },
    },
    {
      id: 'client-critical',
      name: 'Clínica B',
      status: 'active',
      panel_whatsapp_config: null,
      panel_google_config: {
        google_email: 'b@example.com',
      },
      panel_bot_config: {
        professional_name: 'Dr. B',
      },
    },
    {
      id: 'client-warning',
      name: 'Clínica C',
      status: 'paused',
      panel_whatsapp_config: {
        evolution_instance_name: 'inst-warn',
        connected_phone: '5511888888888',
        webhook_url: 'https://panel.example.com/api/webhooks/evolution/inst-warn',
      },
      panel_google_config: {
        google_email: 'c@example.com',
      },
      panel_bot_config: {
        professional_name: 'Dra. C',
      },
    },
  ]

  const draftClients = [
    {
      id: 'client-draft',
      name: 'Rascunho',
      panel_whatsapp_config: {
        evolution_instance_name: 'inst-draft',
      },
    },
  ]

  const conflictConfigs = [
    { client_id: 'client-a', evolution_instance_name: 'inst-a', connected_phone: '5511777777777' },
    { client_id: 'client-b', evolution_instance_name: 'inst-b', connected_phone: '5511777777777' },
  ]

  const stuckConversations = [
    {
      id: 'conv-stuck',
      client_id: 'client-critical',
      stage: 'awaiting_human',
      last_incoming_at: '2026-04-12T06:00:00Z',
    },
  ]

  return {
    from(table: string) {
      if (table === 'panel_clients') {
        return makeQuery({
          list(filters) {
            if (filters.some((f) => f.op === 'eq' && f.key === 'status' && f.value === 'draft')) {
              return { data: draftClients, error: null }
            }
            return { data: activeClients, error: null }
          },
        })
      }

      if (table === 'panel_whatsapp_config') {
        return makeQuery({
          list: () => ({ data: conflictConfigs, error: null }),
        })
      }

      if (table === 'conversations') {
        return makeQuery({
          list(filters) {
            if (filters.some((f) => f.op === 'eq' && f.key === 'stage' && f.value === 'awaiting_human')) {
              return { data: stuckConversations, error: null }
            }
            return { data: [], error: null }
          },
        })
      }

      if (table === 'ai_pauses') {
        return makeQuery({
          list: () => ({ data: [], error: null, count: 2 }),
        })
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('GET /api/soc/diagnostic', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T12:00:00Z'))

    mocks.resolveSessionRoleContext.mockResolvedValue({ role: 'admin' })
    mocks.getConnectionState.mockResolvedValue({ instance: { state: 'open' } })
    mocks.createClient.mockResolvedValue(buildClient())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('expõe o resumo consolidado sem remover o payload detalhado', async () => {
    const { GET } = await import('@/app/api/soc/diagnostic/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.overall_status).toBe('critical')
    expect(body.summary).toMatchObject({
      overall_status: 'critical',
      clients: {
        total: 3,
        ok: 1,
        warning: 1,
        critical: 1,
        unknown: 0,
      },
      global: {
        phone_conflicts: 1,
        draft_with_instance: 1,
        stuck_conversations: 1,
        expired_ai_pauses: 2,
      },
    })
    expect(body.global.phone_conflicts).toHaveLength(1)
    expect(body.global.stuck_conversations).toHaveLength(1)
    expect(body.clients).toHaveLength(3)
    expect(body.clients.some((client: { overall: string }) => client.overall === 'critical')).toBe(true)
  })
})
