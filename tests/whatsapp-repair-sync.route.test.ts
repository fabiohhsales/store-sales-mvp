import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getPanelEvolutionWebhookUrl: vi.fn(),
  setWebhook: vi.fn(),
  reconcileConnectionState: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  getPanelEvolutionWebhookUrl: mocks.getPanelEvolutionWebhookUrl,
  setWebhook: mocks.setWebhook,
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

describe('POST /api/whatsapp/instances/[instanceName]/repair-sync', () => {
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
    mocks.getPanelEvolutionWebhookUrl.mockReturnValue('https://panel.example.com/api/webhooks/evolution')
    mocks.reconcileConnectionState.mockResolvedValue({
      instanceName: 'clinic-instance',
      state: 'connecting',
      connectedPhone: null,
      lastUpdatedAt: '2026-03-31T10:00:00.000Z',
    })
  })

  it('reconfigura webhook e retorna o estado reconciliado', async () => {
    const { POST } = await import('@/app/api/whatsapp/instances/[instanceName]/repair-sync/route')
    const response = await POST({} as never, { params: Promise.resolve({ instanceName: 'clinic-instance' }) })

    expect(mocks.setWebhook).toHaveBeenCalledWith(
      'clinic-instance',
      'https://panel.example.com/api/webhooks/evolution'
    )
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      webhookUrl: 'https://panel.example.com/api/webhooks/evolution',
      state: 'connecting',
    })
  })
})
