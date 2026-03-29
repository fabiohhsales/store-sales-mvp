-- Migration 011: Intake estruturado de dados do paciente
-- Adiciona configuração de intake no panel_bot_config e campos no contacts.

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS intake_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_fields jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS intake_request_photos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_photos_count integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS intake_handoff_after_photos boolean DEFAULT true;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz;
