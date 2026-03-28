-- Migration 008: Adiciona campos Chatwoot direto em panel_clients
-- Permite provisionar a Account Chatwoot na criação do cliente,
-- antes de qualquer configuração de WhatsApp.

ALTER TABLE panel_clients
  ADD COLUMN IF NOT EXISTS chatwoot_account_id integer,
  ADD COLUMN IF NOT EXISTS chatwoot_agent_token text;

COMMENT ON COLUMN panel_clients.chatwoot_account_id IS
  'ID da Account Chatwoot isolada deste cliente — criada na criação do cliente, independente do WhatsApp';

COMMENT ON COLUMN panel_clients.chatwoot_agent_token IS
  'Access token admin da Account Chatwoot — usado para provisionar agentes, labels e apps embutidos';
