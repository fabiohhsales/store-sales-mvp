import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createInstance: vi.fn(),
  setChatwootIntegration: vi.fn(),
  getPanelChatwootWebhookUrl: vi.fn(),
  getPanelEvolutionWebhookUrl: vi.fn(),
  setWebhook: vi.fn(),
  deleteInstance: vi.fn(),
  createChatwootAccount: vi.fn(),
  createChatwootAgent: vi.fn(),
  findInboxByName: vi.fn(),
  configureChatwootWebhook: vi.fn(),
  deleteChatwootAccount: vi.fn(),
  ensureChatwootLabels: vi.fn(),
  createWhatsAppConfig: vi.fn(),
  getBotConfigByClientId: vi.fn(),
  updateClient: vi.fn(),
  getClientById: vi.fn(),
  insertAuditLog: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  createInstance: mocks.createInstance,
  setChatwootIntegration: mocks.setChatwootIntegration,
  getPanelChatwootWebhookUrl: mocks.getPanelChatwootWebhookUrl,
  getPanelEvolutionWebhookUrl: mocks.getPanelEvolutionWebhookUrl,
  setWebhook: mocks.setWebhook,
  deleteInstance: mocks.deleteInstance,
}))

vi.mock('@/lib/api/chatwoot', () => ({
  createChatwootAccount: mocks.createChatwootAccount,
  createChatwootAgent: mocks.createChatwootAgent,
  findInboxByName: mocks.findInboxByName,
  configureChatwootWebhook: mocks.configureChatwootWebhook,
  deleteChatwootAccount: mocks.deleteChatwootAccount,
  ensureChatwootLabels: mocks.ensureChatwootLabels,
}))

vi.mock('@/lib/db/whatsapp-config', () => ({
  createWhatsAppConfig: mocks.createWhatsAppConfig,
}))

vi.mock('@/lib/db/bot-config', () => ({
  getBotConfigByClientId: mocks.getBotConfigByClientId,
}))

vi.mock('@/lib/db/clients', () => ({
  updateClient: mocks.updateClient,
  getClientById: mocks.getClientById,
}))

vi.mock('@/lib/db/audit-log', () => ({
  insertAuditLog: mocks.insertAuditLog,
}))

describe('POST /api/whatsapp/instances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(global, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn()
      return 0 as never
    }) as unknown as typeof setTimeout)

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: 'admin@example.com' } },
          error: null,
        }),
      },
    })

    mocks.getClientById.mockResolvedValue({
      id: 'client-1',
      name: 'Clinic',
      owner_name: 'Owner',
      email: 'owner@example.com',
      provisioned_agents: [],
      chatwoot_account_id: 321,
      chatwoot_agent_token: 'chatwoot-token',
      chatwoot_email: 'owner@example.com',
    })
    mocks.getPanelChatwootWebhookUrl.mockReturnValue('https://panel.example.com/api/webhooks/chatwoot')
    mocks.getPanelEvolutionWebhookUrl.mockReturnValue('https://panel.example.com/api/webhooks/evolution')
    mocks.createInstance.mockResolvedValue({
      instance: {
        instanceName: 'clinic-instance',
        instanceId: 'ev-1',
        integration: 'WHATSAPP-BAILEYS',
        token: 'ev-token',
        status: 'created',
      },
      hash: { apikey: 'hash' },
      qrcode: { base64: 'base64', pairingCode: null, code: 'raw', count: 1 },
    })
    mocks.findInboxByName.mockResolvedValue({ id: 55 })
    mocks.createWhatsAppConfig.mockResolvedValue({ id: 'cfg-1' })
    mocks.updateClient.mockResolvedValue({})
    mocks.insertAuditLog.mockResolvedValue(undefined)
  })

  it('configura o webhook da Evolution durante a criação da instância', async () => {
    const { POST } = await import('@/app/api/whatsapp/instances/route')
    const response = await POST({
      json: async () => ({
        client_id: 'client-1',
        instance_name: 'clinic-instance',
      }),
    } as never)

    expect(response.status).toBe(201)
    expect(mocks.setWebhook).toHaveBeenCalledWith(
      'clinic-instance',
      'https://panel.example.com/api/webhooks/evolution'
    )
    expect(mocks.createWhatsAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        webhook_url: 'https://panel.example.com/api/webhooks/evolution',
      })
    )
  })
})
