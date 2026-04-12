-- Migration 037: Thresholds SLA configuráveis por tenant
-- Coluna JSONB em panel_bot_config para sobrepor defaults do Desk.
-- Shape esperado: { greenMaxMin, amberMaxMin, noOperatorWarnMin, operatorSilenceWarnMin, toastThresholdMin }

ALTER TABLE panel_bot_config ADD COLUMN IF NOT EXISTS sla_thresholds jsonb;
