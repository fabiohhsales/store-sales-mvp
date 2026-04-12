// Geração unificada de alertas operacionais para o Desk.
// Usado por: conversation-list (badges), desk-shell (toasts), get-conversation-context (sidebar).

import type { SlaThresholds } from './sla-config'
import { DEFAULT_SLA_THRESHOLDS } from './sla-config'

export type AlertSeverity = 'danger' | 'warning' | 'info'

export interface OperationalAlert {
  severity: AlertSeverity
  code: string
  message: string
}

interface AlertInput {
  stage: string | null
  lastIncomingAt: string | null
  lastOutgoingAt: string | null
  assignedOperatorId: string | null
  stageChangedAt?: string | null
}

/**
 * SLA color tier: green / amber / red.
 * Uses thresholds from config instead of hardcoded values.
 */
export function slaColor(
  stageChangedAt: string | null,
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS
): 'green' | 'amber' | 'red' {
  if (!stageChangedAt) return 'green'
  try {
    const mins = Math.floor((Date.now() - new Date(stageChangedAt).getTime()) / 60000)
    if (mins < thresholds.greenMaxMin) return 'green'
    if (mins < thresholds.amberMaxMin) return 'amber'
    return 'red'
  } catch {
    return 'green'
  }
}

/**
 * Waiting badge for conversation list (green / amber / red with time label).
 */
export function getWaitingBadge(
  date: string | null,
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS
): { label: string; className: string } {
  const fallback = {
    label: 'Espera',
    className: 'border-border bg-muted/40 text-muted-foreground',
  }

  if (!date) return fallback

  const timestamp = new Date(date).getTime()
  if (Number.isNaN(timestamp)) return fallback

  const mins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const wait =
    mins < 1
      ? 'agora'
      : mins < 60
        ? `${mins}min`
        : hours < 24
          ? `${hours}h`
          : `${days}d`

  if (mins < thresholds.greenMaxMin) {
    return {
      label: `Espera ${wait}`,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    }
  }

  if (mins < thresholds.amberMaxMin) {
    return {
      label: `Espera ${wait}`,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }

  return {
    label: `Espera ${wait}`,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  }
}

/**
 * Derives operational alerts for a single conversation.
 * Used by conversation-list (badge icons) and desk-shell (toast source).
 */
export function deriveAlerts(
  conv: AlertInput,
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS
): OperationalAlert[] {
  const alerts: OperationalAlert[] = []
  const now = Date.now()

  if (conv.stage === 'awaiting_human' && conv.lastIncomingAt) {
    const waitMs = now - new Date(conv.lastIncomingAt).getTime()
    const waitMin = waitMs / 60_000

    if (waitMin > thresholds.amberMaxMin) {
      alerts.push({
        severity: 'danger',
        code: 'sla_breach',
        message: `SLA em risco — espera >${thresholds.amberMaxMin}min`,
      })
    }

    if (!conv.assignedOperatorId && waitMin > thresholds.noOperatorWarnMin) {
      alerts.push({
        severity: 'warning',
        code: 'no_operator',
        message: `Sem operador atribuído há >${thresholds.noOperatorWarnMin}min`,
      })
    }
  }

  if (conv.stage === 'in_service' && conv.lastOutgoingAt) {
    const silenceMs = now - new Date(conv.lastOutgoingAt).getTime()
    const silenceMin = silenceMs / 60_000

    if (silenceMin > thresholds.operatorSilenceWarnMin) {
      alerts.push({
        severity: 'warning',
        code: 'operator_silence',
        message: `Sem resposta do operador há >${thresholds.operatorSilenceWarnMin}min`,
      })
    }
  }

  return alerts
}

/**
 * Checks if a conversation has crossed the toast threshold.
 * Used by desk-shell periodic SLA check.
 */
export function shouldToastSla(
  conv: AlertInput,
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS
): boolean {
  if (conv.stage !== 'awaiting_human' || !conv.lastIncomingAt) return false
  const waitMs = Date.now() - new Date(conv.lastIncomingAt).getTime()
  return waitMs > thresholds.toastThresholdMin * 60_000
}
