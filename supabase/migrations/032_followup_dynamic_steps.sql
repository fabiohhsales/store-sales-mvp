-- Migration 032: Dynamic follow-up steps, delivery tracking, alerts table
--
-- Adds JSONB columns for user-configurable follow-up steps per cadence,
-- evolution_message_id for delivery tracking, and followup_alerts table.

-- 1. Dynamic steps config (JSONB arrays on panel_bot_config)
ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS lead_followup_steps jsonb,
  ADD COLUMN IF NOT EXISTS atendimento_followup_steps jsonb,
  ADD COLUMN IF NOT EXISTS agendado_followup_steps jsonb;

-- 2. Delivery tracking on cadence steps
ALTER TABLE followup_cadence_steps
  ADD COLUMN IF NOT EXISTS evolution_message_id text;

-- 3. Ensure followup_logs exists (was created outside migrations)
CREATE TABLE IF NOT EXISTS followup_logs (
  id uuid PRIMARY KEY,
  conversation_id uuid,
  contact_id uuid,
  workflow_name text,
  step_name text,
  message_sent text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE followup_logs
  ADD COLUMN IF NOT EXISTS evolution_message_id text;

-- 4. Follow-up alerts (circuit breaker, API errors, cron failures)
CREATE TABLE IF NOT EXISTS followup_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE,
  cadence_type text NOT NULL,
  alert_type text NOT NULL,
  message text,
  details jsonb,
  resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_alerts_client_unresolved
  ON followup_alerts(client_id, resolved) WHERE NOT resolved;
