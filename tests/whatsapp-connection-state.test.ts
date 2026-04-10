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

function createAdminClientMock() {
  return {
    from(table: string) {
      if (table === 'panel_whatsapp_config') {
        return {
          // Conflict-check path: .select(...).eq('connected_phone', ...).neq(...).maybeSingle()
          select(_columns?: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  neq(_col2: string, _val2: string) {
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
          // Main update path: .update(updates).eq('evolution_instance_name', ...).select('client_id').maybeSingle()
          update(updates: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('evolution_instance_name')
                expect(value).toBe('clinic-instance')
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return {
                          data: { client_id: 'client-1', updates },
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

      if (table === 'panel_bot_config') {
        return {
          select(_columns?: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: { client_id: 'client-1' }, error: null }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'panel_clients') {
        return {
          update(updates: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('client-1')
                return {
                  in(statusColumn: string, allowed: string[]) {
                    expect(statusColumn).toBe('status')
                    expect(allowed).toEqual(['pending_whatsapp', 'pending_google', 'disconnected', 'configuring'])
                    return Promise.resolve({ error: null, data: { updates } })
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

describe('whatsapp connection state service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createAdminClient.mockImplementation(() => createAdminClientMock())
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
})
