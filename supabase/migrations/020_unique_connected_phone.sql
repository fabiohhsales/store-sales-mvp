-- Migration 020: Prevenir que o mesmo número de WhatsApp seja conectado em 2 clientes diferentes
-- Causa raiz: sem constraint, uma instância podia ser reassociada a outro cliente com o mesmo phone conectado
-- Impacto: conflito silencioso no pipeline (bot responde pelo cliente errado)

-- Índice único parcial: só aplica quando connected_phone não é NULL
-- Isso permite múltiplas instâncias desconectadas (connected_phone = NULL) sem conflito
CREATE UNIQUE INDEX IF NOT EXISTS panel_whatsapp_config_connected_phone_unique
  ON panel_whatsapp_config (connected_phone)
  WHERE connected_phone IS NOT NULL;

COMMENT ON INDEX panel_whatsapp_config_connected_phone_unique
  IS 'Garante que um número de WhatsApp só pode estar conectado a um único cliente por vez';
