-- Migration 023: adiciona campo timezone ao panel_bot_config
-- Permite que cada cliente configure seu timezone local (ex: "Europe/Athens" para ChoiExpert)
-- Default mantém compatibilidade com clientes existentes no Brasil

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
