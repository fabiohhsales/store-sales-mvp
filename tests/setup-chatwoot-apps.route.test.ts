import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getClientById: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/db/clients', () => ({
  getClientById: mocks.getClientById,
}))

interface TokenRow {
  token: string
  label: string
  client_id: string
}

interface DashboardApp {
  id: number
  title: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createAdminClientMock(state: { tokens: TokenRow[] }) {
  return {
    from(table: string) {
      if (table !== 'panel_embed_tokens') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select() {
          return {
            eq(_column: string, clientId: string) {
              return {
                async in(_inColumn: string, values: string[]) {
                  return {
                    data: state.tokens
                      .filter((row) => row.client_id === clientId && values.includes(row.label))
                      .map((row) => ({ token: row.token, label: row.label })),
                    error: null,
                  }
                },
              }
            },
          }
        },
        insert(row: { user_id: string; client_id: string; label: string }) {
          return {
            select() {
              return {
                async single() {
                  const token = row.label.startsWith('Pipeline')
                    ? 'new-kanban-token'
                    : 'new-agenda-token'

                  state.tokens.push({
                    token,
                    label: row.label,
                    client_id: row.client_id,
                  })

                  return {
                    data: { token },
                    error: null,
                  }
                },
              }
            },
          }
        },
        delete() {
          return {
            async in(_column: string, values: string[]) {
              state.tokens = state.tokens.filter((row) => !values.includes(row.token))
              return { error: null }
            },
          }
        },
      }
    },
  }
}

describe('POST /api/clients/[id]/setup-chatwoot-apps', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.CHATWOOT_URL = 'https://chatwoot.example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://panel.example.com'
  })

  it('preserva embeds antigos quando a criação do segundo Dashboard App falha', async () => {
    let apps: DashboardApp[] = [
      { id: 10, title: 'Pipeline' },
      { id: 11, title: 'Agenda' },
    ]

    const state = {
      tokens: [
        { token: 'old-kanban-token', label: 'Pipeline (Chatwoot)', client_id: 'client-1' },
        { token: 'old-agenda-token', label: 'Agenda (Chatwoot)', client_id: 'client-1' },
      ] satisfies TokenRow[],
    }

    let createCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.endsWith('/dashboard_apps') && (!init?.method || init.method === 'GET')) {
          return jsonResponse({ payload: apps })
        }

        if (url.endsWith('/dashboard_apps') && init?.method === 'POST') {
          createCount += 1
          if (createCount === 1) {
            const newApp = { id: 100, title: 'Pipeline' }
            apps = [...apps, newApp]
            return jsonResponse({ payload: newApp }, 201)
          }

          return jsonResponse({ error: 'Agenda create failed' }, 422)
        }

        if (url.includes('/dashboard_apps/') && init?.method === 'DELETE') {
          const appId = Number(url.split('/').pop())
          apps = apps.filter((app) => app.id !== appId)
          return new Response(null, { status: 204 })
        }

        throw new Error(`Unhandled fetch call: ${url}`)
      })
    )

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    })
    mocks.createAdminClient.mockImplementation(() => createAdminClientMock(state))
    mocks.getClientById.mockResolvedValue({
      chatwoot_account_id: 42,
      chatwoot_agent_token: 'chatwoot-token',
      panel_whatsapp_config: null,
    })

    const { POST } = await import('@/app/api/clients/[id]/setup-chatwoot-apps/route')

    const response = await POST(
      { nextUrl: new URL('https://panel.example.com') } as never,
      { params: Promise.resolve({ id: 'client-1' }) }
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Agenda'),
    })

    expect(apps.map((app) => app.id)).toEqual(expect.arrayContaining([10, 11]))
    expect(apps.map((app) => app.id)).not.toContain(100)

    expect(state.tokens.map((row) => row.token)).toEqual(
      expect.arrayContaining(['old-kanban-token', 'old-agenda-token'])
    )
    expect(state.tokens.map((row) => row.token)).not.toEqual(
      expect.arrayContaining(['new-kanban-token', 'new-agenda-token'])
    )
  })
})