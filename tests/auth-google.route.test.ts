// OAuth flow tests for /api/auth/google/[clientId] and /api/auth/google/callback.
// Covers: auth start redirect shape, unauthenticated rejection, callback happy
// path (with calendar_mode='google_oauth' persistence), missing refresh_token,
// and upstream Google error.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
  getToken: vi.fn(),
  userinfoGet: vi.fn(),
  generateAuthUrl: vi.fn(),
  setCredentials: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('googleapis', () => {
  class FakeOAuth2 {
    generateAuthUrl(opts: Record<string, unknown>) {
      return mocks.generateAuthUrl(opts)
    }
    async getToken(code: string) {
      return mocks.getToken(code)
    }
    setCredentials(tokens: Record<string, unknown>) {
      mocks.setCredentials(tokens)
    }
  }
  return {
    google: {
      auth: { OAuth2: FakeOAuth2 },
      oauth2: (_opts: unknown) => ({
        userinfo: { get: async () => mocks.userinfoGet() },
      }),
    },
  }
})

import { GET as startOAuth } from '@/app/api/auth/google/[clientId]/route'
import { GET as callbackOAuth } from '@/app/api/auth/google/callback/route'

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://panel.example.com'
  process.env.GOOGLE_CLIENT_ID = 'g-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'g-client-secret'

  mocks.generateAuthUrl.mockReturnValue(
    'https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/calendar&state=client-42'
  )
  mocks.getUser.mockReset()
  mocks.getToken.mockReset()
  mocks.userinfoGet.mockReset()
  mocks.upsert.mockReset()
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.createAdminClient.mockReturnValue({
    from: (_table: string) => ({
      upsert: mocks.upsert,
    }),
  })

  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('GET /api/auth/google/[clientId] — start OAuth', () => {
  it('returns 401 when the user is not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = new NextRequest('https://panel.example.com/api/auth/google/client-42')
    const res = await startOAuth(req, { params: Promise.resolve({ clientId: 'client-42' }) })

    expect(res.status).toBe(401)
    expect(mocks.generateAuthUrl).not.toHaveBeenCalled()
  })

  it('redirects to a Google auth URL with offline access, consent prompt, calendar scope and clientId as state', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })

    const req = new NextRequest('https://panel.example.com/api/auth/google/client-42')
    const res = await startOAuth(req, { params: Promise.resolve({ clientId: 'client-42' }) })

    expect(res.status).toBe(307)
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: 'offline',
        prompt: 'consent',
        state: 'client-42',
        scope: ['https://www.googleapis.com/auth/calendar'],
      })
    )
    expect(res.headers.get('location')).toContain('accounts.google.com')
  })
})

describe('GET /api/auth/google/callback', () => {
  it('persists tokens with calendar_mode="google_oauth" on happy path', async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        refresh_token: 'rt-123',
        access_token: 'at-123',
        expiry_date: Date.UTC(2026, 5, 1),
        scope: 'https://www.googleapis.com/auth/calendar',
      },
    })
    mocks.userinfoGet.mockResolvedValue({ data: { email: 'client@example.com' } })

    const req = new NextRequest(
      'https://panel.example.com/api/auth/google/callback?code=abc&state=client-42'
    )
    const res = await callbackOAuth(req)

    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    const [payload, options] = mocks.upsert.mock.calls[0]
    expect(payload).toMatchObject({
      client_id: 'client-42',
      refresh_token: 'rt-123',
      access_token: 'at-123',
      calendar_mode: 'google_oauth',
      google_email: 'client@example.com',
      calendar_id: 'primary',
    })
    expect(options).toEqual({ onConflict: 'client_id' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('google_connected=1')
  })

  it('redirects with google_error=no_refresh_token and does NOT upsert when refresh_token is missing', async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: 'at-only',
        scope: 'https://www.googleapis.com/auth/calendar',
        // refresh_token intentionally omitted (real Google behavior on re-consent without prompt=consent)
      },
    })

    const req = new NextRequest(
      'https://panel.example.com/api/auth/google/callback?code=abc&state=client-42'
    )
    const res = await callbackOAuth(req)

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('google_error=no_refresh_token')
  })

  it('redirects with google_error=access_denied and does NOT call getToken when Google reports an error', async () => {
    const req = new NextRequest(
      'https://panel.example.com/api/auth/google/callback?error=access_denied&state=client-42'
    )
    const res = await callbackOAuth(req)

    expect(mocks.getToken).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('google_error=access_denied')
  })

  it('redirects with google_error=save_failed when Supabase upsert fails', async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        refresh_token: 'rt-123',
        access_token: 'at-123',
        scope: 'https://www.googleapis.com/auth/calendar',
      },
    })
    mocks.userinfoGet.mockResolvedValue({ data: { email: 'client@example.com' } })
    mocks.upsert.mockResolvedValue({ error: { message: 'boom' } })

    const req = new NextRequest(
      'https://panel.example.com/api/auth/google/callback?code=abc&state=client-42'
    )
    const res = await callbackOAuth(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('google_error=save_failed')
  })
})
