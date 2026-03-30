-- Migration 012: notas internas do Desk por conversa.
-- Notas privadas para operadores/admins, sem envio ao paciente.

CREATE TABLE IF NOT EXISTS conversation_operator_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  operator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operator_email text NOT NULL,
  operator_name text,
  content text NOT NULL CHECK (char_length(btrim(content)) > 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_operator_notes_conversation
  ON conversation_operator_notes(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_operator_notes_client
  ON conversation_operator_notes(client_id, created_at DESC);
