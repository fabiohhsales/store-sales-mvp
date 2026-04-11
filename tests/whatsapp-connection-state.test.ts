import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConnectionState: vi.fn(),
  fetchInstances: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/api/evolution', () => ({
  getConnectionState: mocks.getConnectionState,
  fetchInstances: mocks.fetchInstances,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

interface AdminOpts {
  /** If set, the conflict-check query returns another instance using the same phone */
  conflictPhone?: string | null
  /** Whether panel_bot_config exists for client-1 (default true → nextStatus = 'active') */
  hasBotConfig?: boolean
}

interface CapturedUpdate {
  table: string
  payload: Record<string, unknown>
  filter: { key: string; value: unknown }
}

function buildAdmin(opts: AdminOpts = {}) {
  const updates: CapturedUpdate[] = []

  function table(name: string) {
    if (name === 'panel_whatsapp_config') {
      return {
        // Read-only conflict check: .select().eq().neq().maybeSingle()
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                neq(_col2: string, _val2: unknown) {
                  return {
                    async maybeSingle() {
                      return {
                        data: opts.conflictPhone
                          ? { client_id: 'other-client', evolution_instance_name: 'other-instance' }
                          : null,
                        error: null,
                      }
                    },
                  }
                },
              }
            },
          }
        },
        // Write: .update().eq().select('client_id').maybeSingle()
        update(payload: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              updates.push({ table: name, payload, filter: { key: col, value: val } })
              return {
                select(_cols: string) {
                  return {
                    async maybeSingle() {
                      return { data: { client_id: 'client-1', ...payload }, error: null }
                    },
                  }
                },
              }
            },
          }
        },
      }
    }

    if (name === 'panel_bot_config') {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                async maybeSingle() {
                  return {
                    data: opts.hasBotConfig !== false ? { client_id: 'client-1' } : null,
                    error: null,
                  }
                },
              }
            },
          }
        },
      }
    }

    if (name === 'panel_clients') {
      return {
        update(payload: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              return {
                in(_col: string, _allowed: string[]) {
                  updates.push({ table: name, payload, filter: { key: col, value: val } })
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        },
      }
    }

    throw new Error(`Unexpected table: ${name}`)
  }

  return { admin: { from: (name: string) => table(name) }, updates }
}

describe('whatsapp connection state service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.createAdminClient.mockImplementation(() => buildAdmin().admin)
  })

  it('reconcilia estado open e persiste connected_phone', async () => {
    mocks.getConnectionState.mockResolvedValue({
      instance: { instanceName: 'clinic-instance', state: 'open' },
    })
    mocks.fetchInstances.mockResolvedValue([
      {
        instance: {
          instanceName: 'clinic-instance',
          instanceId: 'id-1',
          owner: '55 11 99999-9999',
          profileName: 'Clinic',
          profilePictureUrl: null,
          profileStatus: '',
          status: 'open',
          serverUrl: '',
          apikey: '',
          integration: 'WHATSAPP-BAILEYS',
        },
      },
    ])

    const { reconcileConnectionState } = await import('@/lib/whatsapp/connection-state')
    const snapshot = await reconcileConnectionState('clinic-instance')

    expect(snapshot.state).toBe('open')
    expect(snapshot.connectedPhone).toBe('5511999999999')
  })

  it('reconcilia estado connecting sem connected_phone', async () => {
    mocks.getConnectionState.mockResolvedValue({
      instance: { instanceName: 'clinic-instance', state: 'connecting' },
    })
    mocks.fetchInstances.mockResolvedValue([])

    const { reconcileConnectionState } = await import('@/lib/whatsapp/connection-state')
    const snapshot = await reconcileConnectionState('clinic-instance')

    expect(snapshot.state).toBe('connecting')
    expect(snapshot.connectedPhone).toBeNull()
  })

  it('trata close como disconnected', async () => {
    mocks.getConnectionState.mockResolvedValue({
      instance: { instanceName: 'clinic-instance', state: 'close' },
    })
    mocks.fetchInstances.mockResolvedValue([])

    const { reconcileConnectionState } = await import('@/lib/whatsapp/connection-state')
    const snapshot = await reconcileConnectionState('clinic-instance')

    expect(snapshot.state).toBe('disconnected')
  })

  it('tolera fetchInstances com shape sem instance aninhada', async () => {
    mocks.getConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'open',
    })
    mocks.fetchInstances.mockResolvedValue([
      {
        instanceName: 'clinic-instance',
        owner: '55 21 3955-5278',
        profileName: 'Clinic',
        status: 'open',
      },
      {
        status: 'close',
      },
    ])

    const { reconcileConnectionState } = await import('@/lib/whatsapp/connection-state')
    const snapshot = await reconcileConnectionState('clinic-instance')

    expect(snapshot.state).toBe('open')
    expect(snapshot.connectedPhone).toBe('552139555278')
  })

  it('ao detectar conflito de numero, salva connected_phone como null', async () => {
    const { admin, updates } = buildAdmin({ conflictPhone: '5511999999999' })
    mocks.createAdminClient.mockReturnValue(admin)

    mocks.getConnectionState.mockResolvedValue({
      instance: { instanceName: 'clinic-instance', state: 'open' },
    })
    mocks.fetchInstances.mockResolvedValue([
      {
        instance: {
          instanceName: 'clinic-instance',
          owner: '55 11 99999-9999',
          status: 'open',
        },
      },
    ])

    const { reconcileConnectionState } = await import('@/lib/whatsapp/connection-state')
    await reconcileConnectionState('clinic-instance')

    const whatsappUpdate = updates.find((u) => u.table === 'panel_whatsapp_config')
    expect(whatsappUpdate?.payload.connected_phone).toBeNull()
    // panel_clients must NOT be touched — function returns early on conflict
    expect(updates.find((u) => u.table === 'panel_clients')).toBeUndefined()
  })

  it('state=open sem panel_bot_config, panel_clients atualizado para pending_google', async () => {
    const { admin, updates } = buildAdmin({ hasBotConfig: false })
    mocks.createAdminClient.mockReturnValue(admin)

    mocks.getConnectionState.mockResolvedValue({
      instance: { instanceName: 'clinic-instance', state: 'open' },
    })
    mocks.fetchInstances.mockResolvedValue([
      {
        instance: {
          instanceName: 'clinic-instance',
          owner: '55 11 99999-9999',
          status: 'open',
        },
      },
    ])

    const { reconcileConnectionState } = await import('@/lib/whatsapp/connection-state')
    await reconcileConnectionState('clinic-instance')

    const clientUpdate = updates.find((u) => u.table === 'panel_clients')
    expect(clientUpdate?.payload.status).toBe('pending_google')
  })
})
