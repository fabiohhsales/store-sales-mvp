import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  reconcileConnectionState: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/whatsapp/connection-state', () => ({
  reconcileConnectionState: mocks.reconcileConnectionState,
  formatConnectionPayload: (snapshot: {
    instanceName: string
    state: string
    connectedPhone: string | null
    lastUpdatedAt: string
  }) => ({
    instance: snapshot.instanceName,
    state: snapshot.state,
    base64: null,
    pairingCode: null,
    connectedPhone: snapshot.connectedPhone,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }),
}))

describe('GET /api/whatsapp/instances/[instanceName]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
  })

  it('retorna contrato unificado com estado open', async () => {
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'open',
      connectedPhone: '5511999999999',
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/status/route')
    const response = await GET({} as never, { params: Promise.resolve({ instanceName: 'clinic-instance' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      instance: 'clinic-instance',
      state: 'open',
      base64: null,
      pairingCode: null,
      connectedPhone: '5511999999999',
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })
  })

  it('retorna 401 sem usuario autenticado', async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    })

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/status/route')
    const response = await GET({} as never, { params: Promise.resolve({ instanceName: 'clinic-instance' }) })

    expect(response.status).toBe(401)
  })
})
