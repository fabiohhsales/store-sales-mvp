-- Migration: 045_followup_events.sql
-- Fase 1: Histórico auditável de decisões de follow-up
-- Data: 2026-05-07
-- Objetivo: Registrar todos os eventos de follow-up para visibilidade e auditoria

-- =====================================================
-- Tabela: followup_events
-- =====================================================

CREATE TABLE IF NOT EXISTS followup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid,

  event_type text NOT NULL CHECK (
    event_type IN (
      'followup_evaluated',
      'followup_scheduled',
      'followup_sent',
      'followup_skipped',
      'followup_blocked',
      'followup_paused',
      'followup_resumed',
      'followup_cancelled',
      'followup_completed',
      'followup_failed',
      'bot_retake_evaluated',
      'bot_retake_suggested',
      'bot_retake_scheduled',
      'bot_retake_executed',
      'tag_added',
      'tag_removed',
      'state_changed'
    )
  ),

  cadence_type text CHECK (
    cadence_type IN ('lead', 'atendimento', 'agendado', 'human_retake')
  ),
  step_key text,

  previous_state text,
  new_state text,

  reason_code text,
  reason_label text,
  display_text text NOT NULL,

  scheduled_for timestamptz,
  sent_at timestamptz,

  actor_type text NOT NULL DEFAULT 'system' CHECK (
    actor_type IN ('system', 'ai', 'human', 'cron', 'api')
  ),
  actor_id uuid,

  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  requires_human_approval boolean DEFAULT false,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Índices
-- =====================================================

-- Índice principal: eventos de uma conversa (timeline)
CREATE INDEX IF NOT EXISTS idx_followup_events_conversation
  ON followup_events(conversation_id, created_at DESC);

-- Índice para dashboard por cliente
CREATE INDEX IF NOT EXISTS idx_followup_events_client_created
  ON followup_events(client_id, created_at DESC);

-- Índice para filtrar por tipo de evento
CREATE INDEX IF NOT EXISTS idx_followup_events_type
  ON followup_events(client_id, event_type, created_at DESC);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE followup_events ENABLE ROW LEVEL SECURITY;

-- Leitura: operators podem ver eventos do próprio cliente
CREATE POLICY "Operators can read own client's follow-up events"
ON followup_events FOR SELECT
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
CREATE POLICY "Only system can write follow-up events"
ON followup_events FOR INSERT
TO service_role
WITH CHECK (true);

-- =====================================================
-- Comentários
-- =====================================================

COMMENT ON TABLE followup_events IS 
'Histórico auditável de todas as decisões de follow-up. Eventos aparecem na timeline da conversa.';

COMMENT ON COLUMN followup_events.event_type IS 
'Tipo de evento: evaluated, scheduled, sent, skipped, blocked, paused, resumed, cancelled, completed, failed, retake_*';

COMMENT ON COLUMN followup_events.display_text IS 
'Texto amigável para exibir na timeline (ex: "Follow-up programado para amanhã às 09:00")';

COMMENT ON COLUMN followup_events.actor_type IS 
'Quem disparou: system (cron), ai (agent), human (operator), api (external), cron (scheduled job)';

COMMENT ON COLUMN followup_events.metadata IS 
'Dados adicionais em JSON (ex: mensagem enviada, decisão da IA, contexto da avaliação)';

COMMENT ON COLUMN followup_events.confidence IS 
'Score de confiança da IA na decisão (0.0 a 1.0). NULL se decisão não foi da IA.';

COMMENT ON COLUMN followup_events.requires_human_approval IS 
'Se true, o evento representa uma sugestão que aguarda aprovação humana';

-- =====================================================
-- Função auxiliar: registrar mudança de estado
-- =====================================================

CREATE OR REPLACE FUNCTION record_followup_state_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Registra evento de mudança de estado
  IF OLD.state IS DISTINCT FROM NEW.state THEN
    INSERT INTO followup_events (
      client_id,
      conversation_id,
      contact_id,
      event_type,
      cadence_type,
      step_key,
      previous_state,
      new_state,
      reason_code,
      reason_label,
      display_text,
      actor_type,
      confidence,
      metadata
    ) VALUES (
      NEW.client_id,
      NEW.conversation_id,
      NEW.contact_id,
      'state_changed',
      NEW.cadence_type,
      NEW.current_step_key,
      OLD.state,
      NEW.state,
      NEW.reason_code,
      NEW.reason_label,
      format('Estado mudou de %s para %s', OLD.state, NEW.state),
      'system',
      NEW.ai_confidence,
      jsonb_build_object(
        'previous_state', OLD.state,
        'new_state', NEW.state,
        'reason_code', NEW.reason_code
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para registrar mudanças de estado automaticamente
CREATE TRIGGER trigger_record_followup_state_change
  AFTER UPDATE ON conversation_followup_state
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION record_followup_state_change();
