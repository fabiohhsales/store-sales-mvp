-- Migration 033: Conversation context — handoff persistence + event log
-- Adds structured handoff tracking to conversations and an append-only events table.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS journey_stage text,
  ADD COLUMN IF NOT EXISTS handoff_reason_code text,
  ADD COLUMN IF NOT EXISTS handoff_reason_label text,
  ADD COLUMN IF NOT EXISTS handoff_transferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_returned_to_bot_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_system_action text;

-- Append-only audit/event log for conversations
CREATE TABLE IF NOT EXISTS conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  client_id uuid NOT NULL,
  event_type text NOT NULL,
  event_source text NOT NULL,
  payload jsonb,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conv_time
  ON conversation_events (conversation_id, created_at DESC);
