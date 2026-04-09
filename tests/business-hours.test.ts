// Unit tests for isWithinWorkingHours — the per-client business-hours
// gate that replaces the legacy hardcoded 8–17 window in follow-up
// cadences. Honors per-weekday enabled, start/end, optional break, and
// timezone (DST-aware via Intl).

import { describe, it, expect } from 'vitest'
import { isWithinWorkingHours } from '@/lib/followup/business-hours'
import type { WorkingHours } from '@/types/database'

const BUSINESS_DAY = {
  enabled: true,
  start: '08:00',
  end: '18:00',
  break_start: '12:00',
  break_end: '13:00',
}

const FULL_DISABLED_DAY = {
  enabled: false,
  start: '00:00',
  end: '00:00',
  break_start: null,
  break_end: null,
}

function makeHours(overrides: Partial<WorkingHours> = {}): WorkingHours {
  return {
    monday: BUSINESS_DAY,
    tuesday: BUSINESS_DAY,
    wednesday: BUSINESS_DAY,
    thursday: BUSINESS_DAY,
    friday: BUSINESS_DAY,
    saturday: FULL_DISABLED_DAY,
    sunday: FULL_DISABLED_DAY,
    ...overrides,
  }
}

// 2026-04-06 is a Monday. 12:00 UTC = 09:00 America/Sao_Paulo (UTC-3 year-round).
const MON_09H_BRT_UTC = new Date('2026-04-06T12:00:00Z')

describe('isWithinWorkingHours', () => {
  it('returns true at 09:00 BRT on Monday with an 08:00–18:00 window', () => {
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', MON_09H_BRT_UTC)
    ).toBe(true)
  })

  it('returns false before start (07:30 BRT)', () => {
    const sevenThirty = new Date('2026-04-06T10:30:00Z') // 07:30 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', sevenThirty)
    ).toBe(false)
  })

  it('returns false after end (18:30 BRT)', () => {
    const eighteenThirty = new Date('2026-04-06T21:30:00Z') // 18:30 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', eighteenThirty)
    ).toBe(false)
  })

  it('returns false on a disabled day (Sunday)', () => {
    const sundayNoon = new Date('2026-04-05T15:00:00Z') // 12:00 BRT Sun
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', sundayNoon)
    ).toBe(false)
  })

  it('returns false during the lunch break (12:30 BRT with break 12:00–13:00)', () => {
    const twelveThirty = new Date('2026-04-06T15:30:00Z') // 12:30 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', twelveThirty)
    ).toBe(false)
  })

  it('returns true exactly at start (08:00 BRT, inclusive)', () => {
    const eightOClock = new Date('2026-04-06T11:00:00Z') // 08:00 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', eightOClock)
    ).toBe(true)
  })

  it('returns false exactly at end (18:00 BRT, exclusive)', () => {
    const eighteenOClock = new Date('2026-04-06T21:00:00Z') // 18:00 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', eighteenOClock)
    ).toBe(false)
  })

  it('returns false exactly at break_start (12:00 BRT, inclusive)', () => {
    const twelve = new Date('2026-04-06T15:00:00Z') // 12:00 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', twelve)
    ).toBe(false)
  })

  it('returns true exactly at break_end (13:00 BRT, exclusive)', () => {
    const thirteen = new Date('2026-04-06T16:00:00Z') // 13:00 BRT
    expect(
      isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', thirteen)
    ).toBe(true)
  })

  it('returns false (fail-closed) when workingHours is null', () => {
    expect(isWithinWorkingHours(null, 'America/Sao_Paulo', MON_09H_BRT_UTC)).toBe(false)
  })

  it('returns false (fail-closed) when workingHours is undefined', () => {
    expect(isWithinWorkingHours(undefined, 'America/Sao_Paulo', MON_09H_BRT_UTC)).toBe(false)
  })

  it('is timezone-sensitive: same UTC instant inside Athens window but outside Sao_Paulo window', () => {
    // 2026-07-15 06:00 UTC. Athens (EEST, +03:00) = 09:00 Wed → inside 08:00–18:00.
    // Sao_Paulo (BRT, -03:00) = 03:00 Wed → outside.
    const instant = new Date('2026-07-15T06:00:00Z')
    expect(isWithinWorkingHours(makeHours(), 'Europe/Athens', instant)).toBe(true)
    expect(isWithinWorkingHours(makeHours(), 'America/Sao_Paulo', instant)).toBe(false)
  })

  it('is DST-aware: 09:30 Europe/Athens on the day after spring-forward (2026-03-30 EEST) is inside 09:00–17:00', () => {
    // 2026-03-29 is the spring-forward Sunday. The first weekday after is
    // Mon 2026-03-30 in EEST (+03:00). 09:30 local = 06:30 UTC.
    const monAfterSpringForward = new Date('2026-03-30T06:30:00Z')
    const hours = makeHours({
      monday: { enabled: true, start: '09:00', end: '17:00', break_start: null, break_end: null },
    })
    expect(isWithinWorkingHours(hours, 'Europe/Athens', monAfterSpringForward)).toBe(true)
  })

  it('returns false when the schedule has invalid bounds (end <= start)', () => {
    const hours = makeHours({
      monday: { enabled: true, start: '18:00', end: '08:00', break_start: null, break_end: null },
    })
    expect(isWithinWorkingHours(hours, 'America/Sao_Paulo', MON_09H_BRT_UTC)).toBe(false)
  })
})
