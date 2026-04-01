export const AGENDA_STATUSES = [
  'scheduled',
  'confirmed',
  'attended',
  'noshow',
  'cancelled',
  'rescheduled',
] as const

export type AgendaStatus = (typeof AGENDA_STATUSES)[number]

export const AGENDA_SYNC_STATUSES = ['disabled', 'pending', 'synced', 'error'] as const
export type AgendaSyncStatus = (typeof AGENDA_SYNC_STATUSES)[number]

export const AGENDA_VIEWS = ['day', 'week', 'month', 'list'] as const
export type AgendaView = (typeof AGENDA_VIEWS)[number]

export function normalizeAgendaStatus(status: string | null | undefined): AgendaStatus | null {
  if (!status) return null
  if (status === 'no_show') return 'noshow'
  return AGENDA_STATUSES.includes(status as AgendaStatus) ? (status as AgendaStatus) : null
}

export function isAgendaStatus(status: string | null | undefined): status is AgendaStatus {
  return normalizeAgendaStatus(status) !== null
}

export function normalizeAgendaSyncStatus(
  status: string | null | undefined
): AgendaSyncStatus {
  if (!status) return 'pending'
  return AGENDA_SYNC_STATUSES.includes(status as AgendaSyncStatus)
    ? (status as AgendaSyncStatus)
    : 'pending'
}
