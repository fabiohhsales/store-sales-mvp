-- Migration 061: Backfill store_channels from panel_whatsapp_config
INSERT INTO store_channels (id, account_id, provider, evolution_instance_name, phone_number, webhook_url, connection_status, status)
SELECT 
  id, 
  client_id, 
  'evolution'::text, 
  evolution_instance_name, 
  connected_phone,
  webhook_url,
  connection_status,
  'active'::text
FROM panel_whatsapp_config
ON CONFLICT (evolution_instance_name) DO UPDATE 
SET id = EXCLUDED.id, account_id = EXCLUDED.account_id, phone_number = EXCLUDED.phone_number, webhook_url = EXCLUDED.webhook_url, connection_status = EXCLUDED.connection_status;
