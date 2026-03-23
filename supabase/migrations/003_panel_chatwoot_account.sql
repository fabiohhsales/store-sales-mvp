-- Migration 003: Adiciona campos de Account Chatwoot por cliente (Caminho B)
-- Cada cliente passa a ter sua própria Account isolada no Chatwoot

ALTER TABLE panel_whatsapp_config
  ADD COLUMN IF NOT EXISTS chatwoot_account_id integer,
  ADD COLUMN IF NOT EXISTS chatwoot_agent_token text;

COMMENT ON COLUMN panel_whatsapp_config.chatwoot_account_id IS
  'ID da Account Chatwoot isolada deste cliente (Caminho B)';

COMMENT ON COLUMN panel_whatsapp_config.chatwoot_agent_token IS
  'Access token do agente bot nesta Account — usado pelo n8n para enviar mensagens';
