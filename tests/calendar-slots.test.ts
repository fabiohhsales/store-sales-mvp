// Unit tests for timezone / DST handling in src/lib/calendar/slots.ts.
// Focus: Europe/Athens DST transitions + America/Sao_Paulo (no DST since 2019).

import { describe, it, expect } from 'vitest'
import {
  getTzOffset,
  localToUTC,
  toTzISO,
  tzDateStr,
} from '@/lib/calendar/slots'

describe('getTzOffset', () => {
  it('returns +03:00 for Europe/Athens in summer (EEST)', () => {
    // 2026-07-15 12:00 UTC — deep in DST
    const d = new Date('2026-07-15T12:00:00Z')
    expect(getTzOffset('Europe/Athens', d)).toBe('+03:00')
  })

  it('returns +02:00 for Europe/Athens in winter (EET)', () => {
    // 2026-01-15 12:00 UTC — standard time
    const d = new Date('2026-01-15T12:00:00Z')
    expect(getTzOffset('Europe/Athens', d)).toBe('+02:00')
  })

  it('flips offset across the spring-forward boundary (2026-03-29 Europe/Athens)', () => {
    // EU DST starts last Sunday of March at 03:00 local (01:00 UTC).
    const before = new Date('2026-03-29T00:30:00Z') // 02:30 EET
    const after = new Date('2026-03-29T01:30:00Z') // 04:30 EEST
    expect(getTzOffset('Europe/Athens', before)).toBe('+02:00')
    expect(getTzOffset('Europe/Athens', after)).toBe('+03:00')
  })

  it('flips offset across the fall-back boundary (2026-10-25 Europe/Athens)', () => {
    // EU DST ends last Sunday of October at 04:00 local (01:00 UTC).
    const before = new Date('2026-10-25T00:30:00Z') // 03:30 EEST
    const after = new Date('2026-10-25T01:30:00Z') // 03:30 EET
    expect(getTzOffset('Europe/Athens', before)).toBe('+03:00')
    expect(getTzOffset('Europe/Athens', after)).toBe('+02:00')
  })

  it('returns -03:00 for America/Sao_Paulo year-round (no DST since 2019)', () => {
    expect(getTzOffset('America/Sao_Paulo', new Date('2026-01-15T12:00:00Z'))).toBe('-03:00')
    expect(getTzOffset('America/Sao_Paulo', new Date('2026-07-15T12:00:00Z'))).toBe('-03:00')
  })
})

describe('localToUTC', () => {
  it('converts 09:00 Europe/Athens summer to 06:00 UTC', () => {
    const utc = localToUTC('2026-07-15', '09:00', 'Europe/Athens')
    expect(utc.toISOString()).toBe('2026-07-15T06:00:00.000Z')
  })

  it('converts 09:00 Europe/Athens winter to 07:00 UTC', () => {
    const utc = localToUTC('2026-01-15', '09:00', 'Europe/Athens')
    expect(utc.toISOString()).toBe('2026-01-15T07:00:00.000Z')
  })

  it('converts 09:00 Europe/Athens on day AFTER spring-forward to 06:00 UTC', () => {
    // 2026-03-30 is the first full day in EEST.
    const utc = localToUTC('2026-03-30', '09:00', 'Europe/Athens')
    expect(utc.toISOString()).toBe('2026-03-30T06:00:00.000Z')
  })

  it('converts 09:00 Europe/Athens on day BEFORE spring-forward to 07:00 UTC', () => {
    // 2026-03-28 is still EET.
    const utc = localToUTC('2026-03-28', '09:00', 'Europe/Athens')
    expect(utc.toISOString()).toBe('2026-03-28T07:00:00.000Z')
  })

  it('converts 09:00 America/Sao_Paulo to 12:00 UTC (year-round)', () => {
    expect(localToUTC('2026-01-15', '09:00', 'America/Sao_Paulo').toISOString())
      .toBe('2026-01-15T12:00:00.000Z')
    expect(localToUTC('2026-07-15', '09:00', 'America/Sao_Paulo').toISOString())
      .toBe('2026-07-15T12:00:00.000Z')
  })

  it('round-trips through toTzISO for a DST-boundary local time', () => {
    // 10:00 local on 2026-03-30 (first Monday after spring-forward)
    const utc = localToUTC('2026-03-30', '10:00', 'Europe/Athens')
    const iso = toTzISO(utc, 'Europe/Athens')
    expect(iso).toBe('2026-03-30T10:00:00+03:00')
  })
})

describe('toTzISO', () => {
  it('emits +03:00 offset for Europe/Athens summer instants', () => {
    const d = new Date('2026-07-15T06:00:00Z') // 09:00 local EEST
    expect(toTzISO(d, 'Europe/Athens')).toBe('2026-07-15T09:00:00+03:00')
  })

  it('emits +02:00 offset for Europe/Athens winter instants', () => {
    const d = new Date('2026-01-15T07:00:00Z') // 09:00 local EET
    expect(toTzISO(d, 'Europe/Athens')).toBe('2026-01-15T09:00:00+02:00')
  })

  it('emits -03:00 offset for America/Sao_Paulo', () => {
    const d = new Date('2026-07-15T12:00:00Z') // 09:00 local BRT
    expect(toTzISO(d, 'America/Sao_Paulo')).toBe('2026-07-15T09:00:00-03:00')
  })
})

describe('tzDateStr', () => {
  it('formats the local YYYY-MM-DD for an instant near midnight', () => {
    // 2026-07-15 23:30 UTC = 2026-07-16 02:30 Europe/Athens (EEST)
    const d = new Date('2026-07-15T23:30:00Z')
    expect(tzDateStr(d, 'Europe/Athens')).toBe('2026-07-16')
    // Same instant = 2026-07-15 20:30 America/Sao_Paulo
    expect(tzDateStr(d, 'America/Sao_Paulo')).toBe('2026-07-15')
  })
})
