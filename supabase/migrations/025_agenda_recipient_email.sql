-- 025: Campo de email operacional do profissional (independente do Google).
-- Usado como destinatário obrigatório de convites de agenda.
-- Fallback chain: agenda_recipient_email → google_config.google_email → null.

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS agenda_recipient_email text;

COMMENT ON COLUMN panel_bot_config.agenda_recipient_email
  IS 'Email operacional do profissional para receber convites de agenda. Independente do Google.';
