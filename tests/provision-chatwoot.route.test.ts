import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createChatwootAccount: vi.fn(),
  configureChatwootWebhook: vi.fn(),
  ensureChatwootLabels: vi.fn(),
  createChatwootAgent: vi.fn(),
  deleteChatwootAccount: vi.fn(),
  insertAuditLog: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/chatwoot', () => ({
  createChatwootAccount: mocks.createChatwootAccount,
  configureChatwootWebhook: mocks.configureChatwootWebhook,
  ensureChatwootLabels: mocks.ensureChatwootLabels,
  createChatwootAgent: mocks.createChatwootAgent,
  deleteChatwootAccount: mocks.deleteChatwootAccount,
}))

vi.mock('@/lib/db/audit-log', () => ({
  insertAuditLog: mocks.insertAuditLog,
}))

function createAdminClientMock() {
  return {
    from(table: string) {
      if (table === 'panel_clients') {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'client-1',
                        name: 'Clinic',
                        owner_name: 'Owner',
                        email: 'owner@example.com',
                        provisioned_agents: [],
                        chatwoot_email: null,
                        chatwoot_account_id: null,
                        chatwoot_agent_token: null,
                      },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'panel_whatsapp_config') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: null,
                      error: null,
                    }
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

describe('POST /api/clients/[id]/provision-chatwoot', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    process.env.NEXT_PUBLIC_APP_URL = 'https://panel.example.com'
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: 'admin@example.com' } },
          error: null,
        }),
      },
    })
    mocks.createAdminClient.mockImplementation(() => createAdminClientMock())
    mocks.createChatwootAccount.mockResolvedValue({
      id: 321,
      name: 'Clinic',
      access_token: 'new-token',
      login_email: 'login@example.com',
    })
    mocks.configureChatwootWebhook.mockRejectedValue(new Error('Webhook down'))
    mocks.deleteChatwootAccount.mockResolvedValue({ deleted: true })
    mocks.insertAuditLog.mockResolvedValue(undefined)
  })

  it('chama deleteChatwootAccount quando falha após createChatwootAccount', async () => {
    const { POST } = await import('@/app/api/clients/[id]/provision-chatwoot/route')

    const response = await POST(
      {} as never,
      { params: Promise.resolve({ id: 'client-1' }) }
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Webhook down'),
    })

    expect(mocks.deleteChatwootAccount).toHaveBeenCalledTimes(1)
    expect(mocks.deleteChatwootAccount).toHaveBeenCalledWith(321, 'new-token')
  })
})