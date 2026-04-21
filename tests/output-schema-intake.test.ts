// Tests for the intake_save Zod coercion. The AI sometimes emits primitives
// instead of strings — the schema must accept number/boolean and coerce them
// to string so the rest of the pipeline keeps its Record<string, string>
// contract. Arrays/objects/null values inside the record must still fail.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { safeParseAgentOutput, fallbackOutput } from '@/lib/bot/output-schema'

function buildRaw(intakeSave: unknown): string {
  return JSON.stringify({
    reply: 'ok',
    intake_save: intakeSave,
    status_next: 'pending',
    labels_next: ['etapa_triagem'],
    classification: { intent: 'triagem', stage: null, status: 'pending' },
    handoff: { needs_human: false, reason: null },
    actions: {
      agenda_check: { should_check: false, time_window_hint: null },
      agenda_create: {
        should_create: false,
        start_iso: null,
        end_iso: null,
        title: null,
        selected_slot_index: null,
      },
      agenda_update: { should_update: false, google_event_id: null },
    },
    debug: { detected_intent: 'triagem', stage_current: null, notes: null },
  })
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('output-schema intake_save coercion', () => {
  it('coerces number to string', () => {
    const out = safeParseAgentOutput(buildRaw({ age: 35 }))
    expect(out.intake_save).toEqual({ age: '35' })
  })

  it('coerces boolean to string', () => {
    const out = safeParseAgentOutput(buildRaw({ smoker: false }))
    expect(out.intake_save).toEqual({ smoker: 'false' })
  })

  it('coerces a mixed record of string/number/boolean', () => {
    const out = safeParseAgentOutput(
      buildRaw({ name: 'Maria', age: 42, smoker: true })
    )
    expect(out.intake_save).toEqual({ name: 'Maria', age: '42', smoker: 'true' })
  })

  it('preserves null intake_save (does not coerce to "null")', () => {
    const out = safeParseAgentOutput(buildRaw(null))
    expect(out.intake_save).toBeNull()
  })

  it('falls back when an intake_save value is an array', () => {
    const out = safeParseAgentOutput(buildRaw({ age: [1, 2] }))
    expect(out).toBe(fallbackOutput)
  })
})
