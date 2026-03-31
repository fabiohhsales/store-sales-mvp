-- Migration 016: stage_changed_at em conversations.
-- Registra o momento exato em que a conversa mudou de stage.
-- Usado pelo analytics para calcular SLA breach com precisão
-- (quantas conversas estão em awaiting_human há mais de 1h).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;

-- Retroativa: preenche com updated_at para conversas existentes
UPDATE conversations
  SET stage_changed_at = updated_at
  WHERE stage_changed_at IS NULL AND updated_at IS NOT NULL;

-- Trigger: atualiza stage_changed_at sempre que stage mudar
CREATE OR REPLACE FUNCTION fn_conversations_stage_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_stage_changed_at ON conversations;
CREATE TRIGGER trg_conversations_stage_changed_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION fn_conversations_stage_changed_at();

-- Índice para a query de SLA breach
CREATE INDEX IF NOT EXISTS idx_conversations_sla
  ON conversations(client_id, stage, stage_changed_at)
  WHERE stage = 'awaiting_human';
