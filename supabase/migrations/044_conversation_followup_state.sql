-- Migration: 044_conversation_followup_state.sql
-- Fase 1: Estado consolidado de follow-up por conversa
-- Data: 2026-05-07
-- Objetivo: Criar tabela para rastreamento de estado atual de follow-up

-- =====================================================
-- Tabela: conversation_followup_state
-- =====================================================

CREATE TABLE IF NOT EXISTS conversation_followup_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid,

  state text NOT NULL CHECK (
    state IN (
      'none',
      'eligible',
      'scheduled',
      'active',
      'paused_by_human',
      'blocked',
      'recommended_manual',
      'completed',
      'cancelled',
      'failed'
    )
  ),

  cadence_type text CHECK (
    cadence_type IN ('lead', 'atendimento', 'agendado', 'human_retake')
  ),

  current_step_key text,
  current_step_label text,
  total_attempts int DEFAULT 0,

  reason_code text,
  reason_label text,

  next_action text,
  next_scheduled_for timestamptz,

  last_evaluated_at timestamptz,
  last_event_at timestamptz,
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,

  requires_human_approval boolean DEFAULT false,
  ai_confidence numeric,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (conversation_id)
);

-- =====================================================
-- Índices
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_client_state
  ON conversation_followup_state(client_id, state);

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_next_scheduled
  ON conversation_followup_state(client_id, next_scheduled_for)
  WHERE next_scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_last_evaluated
  ON conversation_followup_state(client_id, last_evaluated_at DESC);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE conversation_followup_state ENABLE ROW LEVEL SECURITY;

-- Leitura: operators podem ver estados do próprio cliente
CREATE POLICY "Operators can read own client's follow-up state"
ON conversation_followup_state FOR SELECT
TO authenticated
USING (
  client_id IN (
    -- Operator: client_id vem de panel_users
    SELECT client_id FROM panel_users WHERE id = auth.uid() AND client_id IS NOT NULL
    UNION
    -- Admin: pode ver qualquer cliente
    SELECT id FROM panel_clients WHERE EXISTS (
      SELECT 1 FROM panel_users WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

-- Escrita: apenas service_role (backend)
CREATE POLICY "Only system can write follow-up state"
ON conversation_followup_state FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- Comentários
-- =====================================================

COMMENT ON TABLE conversation_followup_state IS 
'Estado consolidado de follow-up por conversa. Atualizado pelo orchestrator após cada decisão.';

COMMENT ON COLUMN conversation_followup_state.state IS 
'Estado atual: none, eligible, scheduled, active, paused_by_human, blocked, recommended_manual, completed, cancelled, failed';

COMMENT ON COLUMN conversation_followup_state.cadence_type IS 
'Tipo de cadência: lead (sem agendamento), atendimento (pós-humano), agendado (lembretes), human_retake (retomada de conversa parada)';

COMMENT ON COLUMN conversation_followup_state.next_scheduled_for IS 
'Timestamp do próximo envio programado (timestamptz para respeitar timezone)';

COMMENT ON COLUMN conversation_followup_state.reason_code IS 
'Código técnico do motivo (ex: last_message_from_lead_requires_human, human_stagnated, outside_working_hours)';

COMMENT ON COLUMN conversation_followup_state.reason_label IS 
'Descrição amigável do motivo para exibir ao operador';

COMMENT ON COLUMN conversation_followup_state.requires_human_approval IS 
'Se true, o próximo envio exige aprovação manual do operador';

COMMENT ON COLUMN conversation_followup_state.ai_confidence IS 
'Score de confiança da IA (0.0 a 1.0) na decisão tomada';

-- =====================================================
-- Função de updated_at automático
-- =====================================================

CREATE OR REPLACE FUNCTION update_conversation_followup_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_conversation_followup_state_updated_at
  BEFORE UPDATE ON conversation_followup_state
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_followup_state_updated_at();
