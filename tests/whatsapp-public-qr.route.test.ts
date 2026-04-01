import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reconcileConnectionState: vi.fn(),
  connectInstance: vi.fn(),
  getCachedQrCode: vi.fn(),
  setCachedQrCode: vi.fn(),
  clearCachedQrCode: vi.fn(),
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
  getCachedQrCode: mocks.getCachedQrCode,
  setCachedQrCode: mocks.setCachedQrCode,
  clearCachedQrCode: mocks.clearCachedQrCode,
}))

describe('GET /api/whatsapp/instances/[instanceName]/public-qr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna open sem regenerar QR', async () => {
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'open',
      connectedPhone: '5511999999999',
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/public-qr/route')
    const response = await GET(
      { nextUrl: new URL('https://example.com/api/whatsapp/instances/clinic-instance/public-qr') } as never,
      { params: Promise.resolve({ instanceName: 'clinic-instance' }) }
    )

    expect(mocks.connectInstance).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      state: 'open',
      base64: null,
      pairingCode: null,
    })
  })

  it('usa QR em cache sem chamar connect novamente', async () => {
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'disconnected',
      connectedPhone: null,
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })
    mocks.getCachedQrCode.mockReturnValue({
      base64: 'cached-base64',
      pairingCode: '123-456',
      createdAt: Date.parse('2026-03-31T10:01:00.000Z'),
    })

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/public-qr/route')
    const response = await GET(
      { nextUrl: new URL('https://example.com/api/whatsapp/instances/clinic-instance/public-qr') } as never,
      { params: Promise.resolve({ instanceName: 'clinic-instance' }) }
    )

    expect(mocks.connectInstance).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      state: 'disconnected',
      base64: 'cached-base64',
      pairingCode: '123-456',
    })
  })

  it('gera QR quando nao ha cache e instancia esta desconectada', async () => {
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'disconnected',
      connectedPhone: null,
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })
    mocks.getCachedQrCode.mockReturnValue(null)
    mocks.connectInstance.mockResolvedValue({
      base64: 'fresh-base64',
      pairingCode: '654-321',
      code: 'raw',
      count: 1,
    })
    mocks.setCachedQrCode.mockImplementation((_instanceName: string, payload: { base64: string; pairingCode: string }) => ({
      ...payload,
      createdAt: Date.parse('2026-03-31T10:02:00.000Z'),
    }))

    const { GET } = await import('@/app/api/whatsapp/instances/[instanceName]/public-qr/route')
    const response = await GET(
      { nextUrl: new URL('https://example.com/api/whatsapp/instances/clinic-instance/public-qr') } as never,
      { params: Promise.resolve({ instanceName: 'clinic-instance' }) }
    )

    expect(mocks.connectInstance).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toMatchObject({
      state: 'disconnected',
      base64: 'fresh-base64',
      pairingCode: '654-321',
    })
  })
})
