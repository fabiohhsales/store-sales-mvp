// Regression tests for getCalendarClientForConfig — ensures no silent
// fallback from unset/native/unknown calendar_mode to the central
// google_shared account. This is a P0 non-regression guard: an
// Evolution-only client whose calendar_mode is null must NOT end up
// sharing the Sales Tec global calendar.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { getCalendarClientForConfig } from '@/lib/calendar/client'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  // Force-present the shared token so that any accidental fallback
  // would succeed (and thus our null-assertion would fail loudly).
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
  process.env.GOOGLE_REFRESH_TOKEN = 'test-shared-refresh-token'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('getCalendarClientForConfig', () => {
  it('returns null when googleConfig is null', () => {
    expect(getCalendarClientForConfig(null)).toBeNull()
  })

  it('returns null when calendar_mode is null (no silent google_shared fallback)', () => {
    const client = getCalendarClientForConfig({
      calendar_mode: null,
      refresh_token: null,
    })
    expect(client).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('calendar_mode unset'),
      expect.objectContaining({ reason: 'calendar_mode_unset' })
    )
  })

  it('returns null for calendar_mode="native" even with refresh_token present', () => {
    const client = getCalendarClientForConfig({
      calendar_mode: 'native',
      refresh_token: 'would-be-ignored',
    })
    expect(client).toBeNull()
  })

  it('returns null for calendar_mode="google_oauth" without refresh_token', () => {
    const client = getCalendarClientForConfig({
      calendar_mode: 'google_oauth',
      refresh_token: null,
    })
    expect(client).toBeNull()
  })

  it('returns a CalendarClient for calendar_mode="google_oauth" with refresh_token', () => {
    const client = getCalendarClientForConfig({
      calendar_mode: 'google_oauth',
      refresh_token: 'per-client-refresh-token',
    })
    expect(client).not.toBeNull()
    expect(typeof client).toBe('object')
  })

  it('returns a CalendarClient for calendar_mode="google_shared" when env token is set', () => {
    const client = getCalendarClientForConfig({
      calendar_mode: 'google_shared',
      refresh_token: null,
    })
    expect(client).not.toBeNull()
  })

  it('returns null for calendar_mode="google_shared" when GOOGLE_REFRESH_TOKEN is unset', () => {
    delete process.env.GOOGLE_REFRESH_TOKEN
    const client = getCalendarClientForConfig({
      calendar_mode: 'google_shared',
      refresh_token: null,
    })
    expect(client).toBeNull()
  })

  it('returns null for an unknown calendar_mode value', () => {
    const client = getCalendarClientForConfig({
      // @ts-expect-error — deliberately testing an invalid runtime value
      calendar_mode: 'garbage',
      refresh_token: null,
    })
    expect(client).toBeNull()
  })
})
