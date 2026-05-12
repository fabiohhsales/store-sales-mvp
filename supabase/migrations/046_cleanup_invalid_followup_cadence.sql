-- Limpa valores legados de followup_cadence que não são cadências válidas
-- Valores válidos: lead, atendimento, agendado, NULL
-- Valores inválidos encontrados: perdido, pausado, nivel_1, confirmation
UPDATE conversations
SET followup_cadence = NULL
WHERE followup_cadence IS NOT NULL
  AND followup_cadence NOT IN ('lead', 'atendimento', 'agendado');
