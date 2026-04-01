import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  reconcileConnectionState: vi.fn(),
  connectInstance: vi.fn(),
  setCachedQrCode: vi.fn(),
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

vi.mock('@/lib/api/evolution', () => ({
  connectInstance: mocks.connectInstance,
}))

vi.mock('@/lib/whatsapp/qrcode-cache', () => ({
  setCachedQrCode: mocks.setCachedQrCode,
}))

describe('GET /api/whatsapp/instances/[instanceName]/qrcode', () => {
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

  it('nao chama connect quando a instancia ja esta aberta', async () => {
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'open',
      connectedPhone: '5511999999999',
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/qrcode/route')
    const response = await GET({} as never, { params: Promise.resolve({ instanceName: 'clinic-instance' }) })

    expect(mocks.connectInstance).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ state: 'open' })
  })

  it('gera QR explicitamente quando a instancia nao esta aberta', async () => {
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'disconnected',
      connectedPhone: null,
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })
    mocks.connectInstance.mockResolvedValue({
      base64: 'fresh-base64',
      pairingCode: '111-222',
      code: 'raw',
      count: 1,
    })
    mocks.setCachedQrCode.mockImplementation((_instanceName: string, payload: { base64: string; pairingCode: string }) => ({
      ...payload,
      createdAt: Date.parse('2026-03-31T10:02:00.000Z'),
    }))

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/qrcode/route')
    const response = await GET({} as never, { params: Promise.resolve({ instanceName: 'clinic-instance' }) })

    expect(mocks.connectInstance).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toMatchObject({
      state: 'connecting',
      base64: 'fresh-base64',
      pairingCode: '111-222',
    })
  })
})
