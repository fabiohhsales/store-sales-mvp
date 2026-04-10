// Per-client business-hours gate for follow-up cadences.
//
// Replaces the legacy hardcoded 8–17 window in confirmations.ts. Honors the
// full per-client `working_hours` JSON: per-weekday `enabled`, `start`/`end`,
// and optional `break_start`/`break_end`. Timezone-aware via Intl.
//
// Fail-closed policy: if `working_hours` is null/undefined we return false —
// no schedule means no follow-up. This prevents accidental midnight blasts
// when bot config is missing or partially provisioned.

import type { WorkingHours, DaySchedule } from '@/types/database'

const WEEKDAY_KEYS: Record<string, keyof WorkingHours> = {
  sunday: 'sunday',
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
}

function tzWeekday(date: Date, timezone: string): keyof WorkingHours | null {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' })
  const name = fmt.format(date).toLowerCase()
  return WEEKDAY_KEYS[name] ?? null
}

function tzMinutesOfDay(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  // Some locales emit "24" for midnight — normalize to 0.
  const rawHour = parts.hour === '24' ? '0' : parts.hour
  const hour = parseInt(rawHour ?? '0', 10)
  const minute = parseInt(parts.minute ?? '0', 10)
  return hour * 60 + minute
}

function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Returns true iff `now` (default = current instant) lies inside the
 * client's configured working hours for that weekday in `timezone`,
 * excluding any configured break window.
 *
 * Boundary semantics:
 *   - `start` is inclusive; `end` is exclusive.
 *   - `break_start` is inclusive; `break_end` is exclusive.
 */
export function isWithinWorkingHours(
  workingHours: WorkingHours | null | undefined,
  timezone: string,
  now: Date = new Date()
): boolean {
  if (!workingHours) return false

  const weekday = tzWeekday(now, timezone)
  if (!weekday) return false

  const day: DaySchedule | undefined = workingHours[weekday]
  if (!day || !day.enabled) return false

  const start = parseHHMM(day.start)
  const end = parseHHMM(day.end)
  if (start == null || end == null || end <= start) return false

  const current = tzMinutesOfDay(now, timezone)
  if (current < start || current >= end) return false

  const breakStart = parseHHMM(day.break_start)
  const breakEnd = parseHHMM(day.break_end)
  if (breakStart != null && breakEnd != null && breakEnd > breakStart) {
    if (current >= breakStart && current < breakEnd) return false
  }

  return true
}

/**
 * Structured skip log used by all 3 follow-up cadences. Single-line console.log
 * keeps it cheap and grep-friendly. The reason union prevents typos.
 */
export type FollowupSkipReason =
  | 'fora_do_horario'
  | 'sem_conversas'
  | 'sem_candidatos_pos_filtro'
  | 'sem_contato_ou_last_outgoing'
  | 'sem_contato_ou_last_incoming'
  | 'sem_step_elegivel'
  | 'contato_nao_encontrado'
  | 'sem_whatsapp_config'

export function logFollowupSkip(
  cadence: 'lead' | 'atendimento' | 'agendado',
  reason: FollowupSkipReason,
  ctx: { clientId: string; conversationId?: string; appointmentId?: string }
): void {
  console.log(`[Followup ${cadence}] skip reason=${reason}`, ctx)
}
