-- Migration 009: persiste email de login da conta Chatwoot por cliente

ALTER TABLE panel_clients
  ADD COLUMN IF NOT EXISTS chatwoot_email text;

COMMENT ON COLUMN panel_clients.chatwoot_email IS
  'Email usado no login da account Chatwoot deste cliente';

ALTER TABLE panel_whatsapp_config
  ADD COLUMN IF NOT EXISTS chatwoot_email text;

COMMENT ON COLUMN panel_whatsapp_config.chatwoot_email IS
  'Email de login da account Chatwoot associado a configuracao WhatsApp';
