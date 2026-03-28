-- Migration 004: estrutura da cadencia de follow-up completa

-- Tabela de idempotencia para steps enviados nas cadencias
CREATE TABLE IF NOT EXISTS followup_cadence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  cadence_type text NOT NULL CHECK (cadence_type IN ('lead', 'atendimento', 'agendado')),
  step_key text NOT NULL,
  message_sent text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, cadence_type, step_key)
);

CREATE INDEX IF NOT EXISTS idx_followup_cadence_steps_conversation
  ON followup_cadence_steps(conversation_id);

CREATE INDEX IF NOT EXISTS idx_followup_cadence_steps_cadence_step
  ON followup_cadence_steps(cadence_type, step_key, sent_at DESC);

-- Expansao da configuracao de follow-up no panel_bot_config
ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS lead_followup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_followup_msg_d1 text,
  ADD COLUMN IF NOT EXISTS lead_followup_msg_d2 text,
  ADD COLUMN IF NOT EXISTS lead_followup_msg_d3 text,
  ADD COLUMN IF NOT EXISTS lead_followup_msg_d5 text,
  ADD COLUMN IF NOT EXISTS lead_followup_msg_d7 text,
  ADD COLUMN IF NOT EXISTS atendimento_followup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d1 text,
  ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d2 text,
  ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d4 text,
  ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d7 text,
  ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d10 text,
  ADD COLUMN IF NOT EXISTS agendado_followup_msg_d2 text,
  ADD COLUMN IF NOT EXISTS agendado_followup_msg_minus3h text,
  ADD COLUMN IF NOT EXISTS agendado_followup_msg_minus5min text;
