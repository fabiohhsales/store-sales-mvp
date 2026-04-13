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
  resolver: (filters: Array<{ op: string; key: string; value: unknown }>) => {
    data: unknown
    error: null
    count?: number
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
    lte(key: string, value: unknown) {
      filters.push({ op: 'lte', key, value })
      return query
    },
    order() {
      return query
    },
    range() {
      return query
    },
    then(resolve: (value: { data: unknown; error: null; count?: number }) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(resolver(filters)).then(resolve, reject)
    },
  }
  return query
}

function buildClient() {
  const activeClients = [
    {
      id: 'client-active',
      name: 'Clínica Alfa',
      status: 'active',
      panel_whatsapp_config: {
        evolution_instance_name: 'inst-a',
        connected_phone: '5511999999999',
      },
      panel_google_config: null,
      panel_bot_config: null,
    },
    {
      id: 'client-paused',
      name: 'Clínica Beta',
      status: 'paused',
      panel_whatsapp_config: {
        evolution_instance_name: 'inst-b',
        connected_phone: '5511888888888',
      },
      panel_google_config: {
        google_email: 'beta@example.com',
      },
      panel_bot_config: {
        professional_name: 'Dra. Beta',
      },
    },
    {
      id: 'client-down',
      name: 'Clínica Gama',
      status: 'disconnected',
      panel_whatsapp_config: null,
      panel_google_config: {
        google_email: 'gama@example.com',
      },
      panel_bot_config: {
        professional_name: 'Dr. Gama',
      },
    },
  ]

  const conflictConfigs = [
    { client_id: 'client-a', evolution_instance_name: 'inst-1', connected_phone: '5511777777777' },
    { client_id: 'client-b', evolution_instance_name: 'inst-2', connected_phone: '5511777777777' },
  ]

  const staleConversations = [
    {
      id: 'conv-stale',
      last_incoming_at: '2026-04-12T04:00:00Z',
      last_outgoing_at: null,
    },
  ]

  return {
    from(table: string) {
      if (table === 'panel_clients') {
        return makeQuery((filters) => {
          if (filters.some((f) => f.op === 'eq' && f.key === 'status' && f.value === 'draft')) {
            return { data: [], error: null }
          }
          return { data: activeClients, error: null }
        })
      }

      if (table === 'panel_whatsapp_config') {
        return makeQuery(() => ({ data: conflictConfigs, error: null }))
      }

      if (table === 'conversations') {
        return makeQuery(() => ({ data: staleConversations, error: null }))
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('GET /api/soc', () => {
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

  it('mantém os alertas legados e expõe o resumo agrupado por severidade', async () => {
    const { GET } = await import('@/app/api/soc/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.alerts[0].severity).toBe('critical')
    expect(body.summary).toMatchObject({
      total: body.alerts.length,
      bySeverity: {
        critical: 2,
        warning: 3,
        info: 1,
      },
    })
    expect(body.summary.byType).toMatchObject({
      client_disconnected: 1,
      google_missing: 1,
      bot_config_missing: 1,
      bot_inactive: 1,
      client_paused: 1,
      phone_number_conflict: 1,
    })
  })
})
