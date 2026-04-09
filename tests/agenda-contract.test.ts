// Contract tests for the agenda layer's external_event_id canonicalization.
//
// Background: prior to this round, every insert/update wrote both
// `google_event_id` and `external_event_id` with the same value
// (buildSyncResult mirrored them). The legacy `google_event_id` column
// stays in the DB for backward-read of pre-migration rows, but new writes
// only target `external_event_id`.
//
// What this file covers:
//   1. mapAppointmentRow's legacy-read fallback (preserves API surface for
//      old rows that only have google_event_id populated).
//   2. mapAppointmentRow's canonical-read (new rows only have
//      external_event_id; google_event_id is null).
//   3. Both fields populated → external_event_id wins.
//
// What this file does NOT cover (intentionally):
//   - "Insert payload contains no google_event_id key" — that is enforced
//     by a source-level grep guard in the verification step. A runtime
//     test that mocks the full Supabase surface would be ~150 lines of
//     fake-DB plumbing for a guarantee that can be evaded by future
//     refactors. The grep guard `rg "google_event_id\s*:"
//     src/lib/agenda/service.ts` is stronger and self-documenting.

import { describe, expect, it } from 'vitest'
import { mapAppointmentRow } from '@/lib/agenda/service'

function makeRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'appt-1',
    conversation_id: 'conv-1',
    contact_id: 'contact-1',
    title: 'Consulta',
    start_at: '2026-04-08T13:00:00Z',
    end_at: '2026-04-08T14:00:00Z',
    modality: 'remote',
    status: 'scheduled',
    meet_link: null,
    confirmation_sent_at: null,
    confirmation_response: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    source: 'supabase',
    sync_status: 'synced',
    sync_error: null,
    external_calendar_id: 'cal-primary',
    last_synced_at: '2026-04-01T00:00:00Z',
    notes: null,
    contacts: { id: 'contact-1', name: 'Maria', phone_number: '5511999999999' },
    ...overrides,
  }
}

describe('mapAppointmentRow — external_event_id contract', () => {
  it('reads external_event_id when only the canonical column is populated (new rows)', () => {
    const row = makeRow({
      external_event_id: 'gcal-new-1',
      google_event_id: null,
    })
    const mapped = mapAppointmentRow(row)
    expect(mapped.external_event_id).toBe('gcal-new-1')
    // The legacy mirror field is preserved on the API surface for back-compat.
    expect(mapped.google_event_id).toBe('gcal-new-1')
  })

  it('falls back to google_event_id when only the legacy column is populated (pre-migration rows)', () => {
    const row = makeRow({
      external_event_id: null,
      google_event_id: 'gcal-legacy-1',
    })
    const mapped = mapAppointmentRow(row)
    expect(mapped.external_event_id).toBe('gcal-legacy-1')
    expect(mapped.google_event_id).toBe('gcal-legacy-1')
  })

  it('prefers external_event_id when both columns hold values (migration overlap)', () => {
    const row = makeRow({
      external_event_id: 'gcal-canonical',
      google_event_id: 'gcal-stale',
    })
    const mapped = mapAppointmentRow(row)
    expect(mapped.external_event_id).toBe('gcal-canonical')
    // For the legacy field, the row's own google_event_id wins (mapper reads
    // it directly). This documents the current behavior; downstream UI
    // components have always read whatever was in the column.
    expect(mapped.google_event_id).toBe('gcal-stale')
  })

  it('returns empty string for google_event_id and null for external_event_id when neither column is populated', () => {
    const row = makeRow({
      external_event_id: null,
      google_event_id: null,
    })
    const mapped = mapAppointmentRow(row)
    expect(mapped.external_event_id).toBeNull()
    expect(mapped.google_event_id).toBe('')
  })
})
