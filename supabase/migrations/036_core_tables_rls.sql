-- Migration 036: RLS nas tabelas core + index de paginação de mensagens
-- Objetivo: isolar dados por tenant via RLS nas tabelas que antes dependiam
-- apenas de filtragem manual por client_id nas rotas API.
-- createAdminClient() usa service_role key e bypassa RLS — zero impacto nas rotas existentes.

-- =============================================================================
-- 0. Index para paginação de mensagens (Sprint 3 prep)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- =============================================================================
-- 1. ai_pauses — adicionar client_id antes de habilitar RLS
-- =============================================================================

ALTER TABLE ai_pauses ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE;

-- Popula client_id para rows existentes (se houver) via join com conversations
UPDATE ai_pauses
SET client_id = c.client_id
FROM conversations c
WHERE ai_pauses.conversation_id = c.id::text
  AND ai_pauses.client_id IS NULL;

-- =============================================================================
-- 2. Habilitar RLS em todas as tabelas core
-- =============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_operator_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pauses ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Policies — conversations
-- =============================================================================

CREATE POLICY "conversations_select_scoped"
  ON conversations FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );

CREATE POLICY "conversations_insert_scoped"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "conversations_update_scoped"
  ON conversations FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "conversations_delete_admin"
  ON conversations FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 4. Policies — messages (com fallback para client_id IS NULL legado)
-- =============================================================================

CREATE POLICY "messages_select_scoped"
  ON messages FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );

CREATE POLICY "messages_insert_scoped"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "messages_update_scoped"
  ON messages FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "messages_delete_admin"
  ON messages FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 5. Policies — contacts
-- =============================================================================

CREATE POLICY "contacts_select_scoped"
  ON contacts FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );

CREATE POLICY "contacts_insert_scoped"
  ON contacts FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "contacts_update_scoped"
  ON contacts FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "contacts_delete_admin"
  ON contacts FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 6. Policies — conversation_events
-- =============================================================================

CREATE POLICY "conversation_events_select_scoped"
  ON conversation_events FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "conversation_events_insert_scoped"
  ON conversation_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "conversation_events_update_admin"
  ON conversation_events FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "conversation_events_delete_admin"
  ON conversation_events FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 7. Policies — conversation_operator_notes
-- =============================================================================

CREATE POLICY "operator_notes_select_scoped"
  ON conversation_operator_notes FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "operator_notes_insert_scoped"
  ON conversation_operator_notes FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "operator_notes_delete_admin"
  ON conversation_operator_notes FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 8. Policies — canned_responses
-- Shared (operator_user_id IS NULL): qualquer autenticado do client lê
-- Personal (operator_user_id NOT NULL): só o próprio operador ou admin
-- =============================================================================

CREATE POLICY "canned_responses_select_scoped"
  ON canned_responses FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR (
      client_id = auth.user_client_id()
      AND (operator_user_id IS NULL OR operator_user_id = auth.uid())
    )
  );

CREATE POLICY "canned_responses_insert_scoped"
  ON canned_responses FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "canned_responses_update_scoped"
  ON canned_responses FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR (
      client_id = auth.user_client_id()
      AND (operator_user_id IS NULL OR operator_user_id = auth.uid())
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "canned_responses_delete_scoped"
  ON canned_responses FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR (
      client_id = auth.user_client_id()
      AND (operator_user_id IS NULL OR operator_user_id = auth.uid())
    )
  );

-- =============================================================================
-- 9. Policies — appointments (sem client_id direto, usa FK traversal)
-- =============================================================================

CREATE POLICY "appointments_select_scoped"
  ON appointments FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = appointments.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "appointments_insert_scoped"
  ON appointments FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = appointments.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "appointments_update_scoped"
  ON appointments FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = appointments.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = appointments.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "appointments_delete_admin"
  ON appointments FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 10. Policies — followup_cadence_steps (sem client_id direto, usa FK traversal)
-- =============================================================================

CREATE POLICY "followup_steps_select_scoped"
  ON followup_cadence_steps FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = followup_cadence_steps.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "followup_steps_insert_scoped"
  ON followup_cadence_steps FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = followup_cadence_steps.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "followup_steps_update_scoped"
  ON followup_cadence_steps FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = followup_cadence_steps.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = followup_cadence_steps.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "followup_steps_delete_admin"
  ON followup_cadence_steps FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 11. Policies — followup_logs (sem client_id direto, usa FK traversal)
-- =============================================================================

CREATE POLICY "followup_logs_select_scoped"
  ON followup_logs FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = followup_logs.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "followup_logs_insert_scoped"
  ON followup_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = followup_logs.conversation_id
        AND c.client_id = auth.user_client_id()
    )
  );

CREATE POLICY "followup_logs_delete_admin"
  ON followup_logs FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 12. Policies — followup_alerts (tem client_id direto)
-- =============================================================================

CREATE POLICY "followup_alerts_select_scoped"
  ON followup_alerts FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "followup_alerts_insert_scoped"
  ON followup_alerts FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "followup_alerts_update_scoped"
  ON followup_alerts FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "followup_alerts_delete_admin"
  ON followup_alerts FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 13. Policies — ai_pauses (client_id adicionado nesta migration)
-- =============================================================================

CREATE POLICY "ai_pauses_select_scoped"
  ON ai_pauses FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );

CREATE POLICY "ai_pauses_insert_scoped"
  ON ai_pauses FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );

CREATE POLICY "ai_pauses_update_scoped"
  ON ai_pauses FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );

CREATE POLICY "ai_pauses_delete_scoped"
  ON ai_pauses FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
    OR client_id IS NULL
  );
