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

// Re-export from alerts.ts — single source of truth for SLA thresholds
export { slaColor } from './alerts'

// ── Handoff reason labels (PT-BR) ───────────────────────────────────────────

const HANDOFF_REASON_LABELS: Record<string, string> = {
  negative_sentiment: 'Sentimento negativo detectado',
  medical_urgency: 'Urgência médica',
  unknown_intent: 'Intenção não reconhecida',
  photo_handoff: 'Fotos recebidas para análise',
  explicit_request: 'Paciente pediu atendente',
  intake_photos_complete: 'Fotos do intake recebidas',
  multimodal_processing_failed: 'Falha ao interpretar mídia recebida',
  fallback: 'Motivo não classificado',
}

/**
 * Maps a raw handoff reason code to a human-readable label.
 * Returns null if the code is null/undefined or not in the dictionary.
 */
export function handoffReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return HANDOFF_REASON_LABELS[code] ?? null
}

// ── Event type labels (PT-BR) ───────────────────────────────────────────────

export interface EventTypeMeta {
  label: string
  color: string // tailwind color stem, e.g. 'red', 'blue'
}

export const EVENT_TYPE_LABELS: Record<string, EventTypeMeta> = {
  handoff_triggered: { label: 'Transferido para operador', color: 'red' },
  handoff_assumed: { label: 'Operador assumiu', color: 'blue' },
  returned_to_bot: { label: 'Devolvido ao bot', color: 'amber' },
  conversation_resolved: { label: 'Conversa finalizada', color: 'emerald' },
  appointment_created: { label: 'Agendamento criado', color: 'violet' },
  appointment_rescheduled: { label: 'Agendamento reagendado', color: 'violet' },
  appointment_sync_error: { label: 'Erro de sincronização de agenda', color: 'red' },
  intake_updated: { label: 'Dados do intake atualizados', color: 'sky' },
  followup_sent: { label: 'Follow-up enviado', color: 'emerald' },
  followup_blocked: { label: 'Follow-up bloqueado', color: 'amber' },
  bot_paused: { label: 'Bot pausado', color: 'amber' },
  bot_resumed: { label: 'Bot retomado', color: 'emerald' },
  stage_changed: { label: 'Stage alterado', color: 'sky' },
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
