-- Migration 005: Configuração de etapas (etiquetas) por cliente no panel_bot_config

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS stage_labels jsonb NOT NULL DEFAULT '[{"slug":"etapa_triagem","display_name":"Triagem"}]'::jsonb;

COMMENT ON COLUMN panel_bot_config.stage_labels IS
  'Lista de etapas/etiquetas por cliente (slug técnico e nome amigável)';
