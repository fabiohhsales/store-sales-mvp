-- Migration 041: suppression table for operational follow-up cancellations

CREATE TABLE IF NOT EXISTS followup_cadence_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  cadence_type text NOT NULL CHECK (cadence_type IN ('lead', 'atendimento', 'agendado')),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  suppressed_by uuid NOT NULL REFERENCES panel_users(id) ON DELETE RESTRICT,
  reason text,
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_followup_cadence_suppressions_client
  ON followup_cadence_suppressions (client_id, cadence_type);

CREATE INDEX IF NOT EXISTS idx_followup_cadence_suppressions_conversation
  ON followup_cadence_suppressions (conversation_id, cadence_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_cadence_suppressions_active
  ON followup_cadence_suppressions (conversation_id, client_id, cadence_type)
  WHERE released_at IS NULL;
