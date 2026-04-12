// ── Conversation Context types ────────────────────────────────────────────────
// Consolidated view-model for the Desk. Built by get-conversation-context.ts
// from multiple tables and served by GET /api/desk/conversations/[id]/context.

import type { ConductionMode } from '@/lib/desk/conduction'

// ── Sub-types ────────────────────────────────────────────────────────────────

export type IntakeStatus = 'empty' | 'partial' | 'completed'

export type AppointmentContextStatus =
  | 'none'
  | 'pending'
  | 'scheduled'
  | 'rescheduled'
  | 'cancelled'
  | 'noshow'
  | 'sync_error'

export type FollowupContextStatus =
  | 'none'
  | 'eligible'
  | 'scheduled'
  | 'sent'
  | 'blocked'

export type SlaStatus = 'ok' | 'warning' | 'late'

export interface ContextAlert {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface ContextEvent {
  id: string
  event_type: string
  event_source: string
  payload: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

export interface IntakeField {
  key: string
  label: string
  required: boolean
  value: string | null
}

// ── Main type ────────────────────────────────────────────────────────────────

export interface ConversationContext {
  conversationId: string
  contactId: string | null
  clientId: string

  header: {
    contactName: string | null
    contactPhone: string | null
    conversationShortId: string
    stage: string
    journeyStage: string | null
    conductionMode: ConductionMode
    lastMessageAt: string | null
    slaStatus: SlaStatus
  }

  summary: {
    contactReason: string | null
    currentIntent: string | null
    collectedDataSummary: string[]
    handoffReason: string | null
    nextStepSuggested: string | null
    alerts: ContextAlert[]
  }

  operational: {
    intakeStatus: IntakeStatus
    appointmentStatus: AppointmentContextStatus
    followupStatus: FollowupContextStatus
    lastSystemAction: string | null
  }

  appointment: {
    id: string
    serviceName: string | null
    date: string
    time: string
    durationMinutes: number | null
    modality: string | null
    status: string | null
    meetLink: string | null
  } | null

  intake: {
    completionStatus: IntakeStatus
    requiredFields: IntakeField[]
    collectedFields: IntakeField[]
    missingFields: IntakeField[]
    completedAt: string | null
  }

  handoff: {
    isHandoff: boolean
    reasonCode: string | null
    reasonLabel: string | null
    transferredAt: string | null
    returnedToBotAt: string | null
  }

  history: {
    previousConversationsCount: number
    previousAppointmentsCount: number
    lastConversationAt: string | null
    lastAppointmentAt: string | null
  }

  recentEvents: ContextEvent[]
}
