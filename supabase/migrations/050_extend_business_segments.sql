-- Migration 050: estende o constraint de business_segment na tabela panel_bot_config para permitir 'loja'
-- Permite diferenciar o fluxo e layout do cliente de Loja dos clientes Clínicos

ALTER TABLE panel_bot_config DROP CONSTRAINT IF EXISTS panel_bot_config_business_segment_check;
ALTER TABLE panel_bot_config DROP CONSTRAINT IF EXISTS check_business_segment;

ALTER TABLE panel_bot_config ADD CONSTRAINT check_business_segment
  CHECK (business_segment IS NULL OR business_segment IN (
    'medicina',
    'odontologia',
    'psicologia',
    'fisioterapia',
    'estetica',
    'outro',
    'loja'
  ));
