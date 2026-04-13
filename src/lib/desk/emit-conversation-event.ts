// ── Fire-and-forget event emitter for conversation_events ─────────────────────
// Appends a single row. Logs errors but never throws — callers should not
// block on event persistence.

import { createAdminClient } from '@/lib/supabase/admin'

export type ConversationEventType =
  | 'handoff_triggered'
  | 'handoff_assumed'
  | 'returned_to_bot'
  | 'conversation_resolved'
  | 'appointment_created'
  | 'appointment_rescheduled'
  | 'appointment_sync_error'
  | 'intake_updated'
  | 'followup_sent'
  | 'followup_blocked'
  | 'bot_paused'
  | 'bot_resumed'
  | 'bot_resume_triggered'
  | 'bot_resume_skipped'
  | 'bot_resume_failed'
  | 'stage_changed'

export async function emitConversationEvent(
  conversationId: string,
  clientId: string,
  eventType: ConversationEventType,
  eventSource: 'bot' | 'operator' | 'system',
  payload?: Record<string, unknown> | null,
  createdBy?: string | null
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('conversation_events').insert({
      conversation_id: conversationId,
      client_id: clientId,
      event_type: eventType,
      event_source: eventSource,
      payload: payload ?? null,
      created_by: createdBy ?? null,
    })
  } catch (err) {
    console.error(`[emit-event] Failed to log ${eventType} for conv=${conversationId}:`, err)
  }
}
