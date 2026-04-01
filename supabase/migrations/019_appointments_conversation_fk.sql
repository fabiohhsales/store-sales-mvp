-- Migration 019: FK de appointments → conversations para habilitar join PostgREST na Agenda.
-- Sem essa FK, a query conversations!inner(client_id) em listAgendaAppointments falha
-- com erro de schema cache no PostgREST → API retorna "Erro interno" na página de Agenda.

-- Remove orphaned conversation_ids que apontam para conversas inexistentes
UPDATE appointments
  SET conversation_id = NULL
  WHERE conversation_id IS NOT NULL
    AND conversation_id NOT IN (SELECT id FROM conversations);

-- Adiciona FK (conversation_id pode ser NULL — appointment manual sem conversa)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointments_conversation'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT fk_appointments_conversation
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índice para acelerar lookup pelo FK
CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id
  ON appointments(conversation_id)
  WHERE conversation_id IS NOT NULL;
