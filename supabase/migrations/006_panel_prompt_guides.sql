-- Migration 006: guias de processo/comercial para prompt injection

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS process_flow_guide text,
  ADD COLUMN IF NOT EXISTS objections_guide text,
  ADD COLUMN IF NOT EXISTS qualification_questions_guide text,
  ADD COLUMN IF NOT EXISTS disengagement_policy_guide text;

COMMENT ON COLUMN panel_bot_config.process_flow_guide IS
  'Mapa textual das etapas reais do atendimento e critérios de avanço/handoff.';

COMMENT ON COLUMN panel_bot_config.objections_guide IS
  'Objeções comuns e respostas recomendadas para o agente de IA.';

COMMENT ON COLUMN panel_bot_config.qualification_questions_guide IS
  'Perguntas obrigatórias por etapa para triagem e qualificação.';

COMMENT ON COLUMN panel_bot_config.disengagement_policy_guide IS
  'Regras de desistência, encerramento empático e possível reativação.';
