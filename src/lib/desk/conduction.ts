// ── Shared conduction utilities for the Desk ─────────────────────────────────
// Single source of truth for conduction mode derivation, stage labels,
// relative time formatting, and SLA color logic.

export type ConductionMode = 'bot' | 'humano' | 'aguardando'

/**
 * Derives who is currently conducting the conversation based on stage.
 */
export function deriveConductionMode(stage: string | null): ConductionMode {
  if (stage === 'in_service') return 'humano'
  if (stage === 'awaiting_human') return 'aguardando'
  return 'bot'
}

export function conductionLabel(mode: ConductionMode): string {
  const map: Record<ConductionMode, string> = {
    bot: 'Bot',
    humano: 'Humano',
    aguardando: 'Aguardando',
  }
  return map[mode]
}

/**
 * Returns a shadcn Badge `variant` string for the conduction mode.
 */
export function conductionBadgeVariant(
  mode: ConductionMode
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const map: Record<ConductionMode, 'default' | 'secondary' | 'destructive'> = {
    bot: 'secondary',
    humano: 'default',
    aguardando: 'destructive',
  }
  return map[mode]
}

// ── Stage labels (PT-BR) ────────────────────────────────────────────────────

export const STAGE_LABELS: Record<string, string> = {
  bot_triage: 'Bot respondendo',
  awaiting_human: 'Aguardando operador',
  in_service: 'Em atendimento humano',
  resolved: 'Finalizado',
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Compact relative time: "agora", "3min", "2h", "5d".
 * Extracted from conversation-list.tsx to avoid duplication.
 */
export function relativeTime(date: string | null): string {
  if (!date) return ''
  try {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  } catch {
    return ''
  }
}

/**
 * Formatted date-time in pt-BR locale: "12/04/2026, 14:30".
 * Extracted from contact-profile-panel.tsx.
 */
export function formatDateTime(date: string | null): string {
  if (!date) return '-'
  try {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

// ── SLA color ────────────────────────────────────────────────────────────────

/**
 * Returns a color tier for SLA indication based on time since stage change.
 * <15min → green, <60min → amber, >=60min → red.
 */
export function slaColor(stageChangedAt: string | null): 'green' | 'amber' | 'red' {
  if (!stageChangedAt) return 'green'
  try {
    const mins = Math.floor((Date.now() - new Date(stageChangedAt).getTime()) / 60000)
    if (mins < 15) return 'green'
    if (mins < 60) return 'amber'
    return 'red'
  } catch {
    return 'green'
  }
}

/**
 * Returns Tailwind classes for an SLA-colored badge.
 */
export function slaBadgeClasses(color: 'green' | 'amber' | 'red'): string {
  const map: Record<string, string> = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    red: 'border-destructive/30 bg-destructive/10 text-destructive',
  }
  return map[color] ?? ''
}
