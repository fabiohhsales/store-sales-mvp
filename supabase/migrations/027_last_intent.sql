-- 027: Persistir último intent do bot na conversa para observabilidade.
-- Permite: rastreabilidade de intenção, alertas de anomalia, analytics de dashboard.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_intent text;

COMMENT ON COLUMN conversations.last_intent
  IS 'Último intent classificado pelo AI Agent (ex: agenda_check, agenda_create, handoff, intake_save).';
