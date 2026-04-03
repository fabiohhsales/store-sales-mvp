-- Migration 019: saneia dados legados em que o slug do funil foi salvo
-- indevidamente em conversations.stage.
--
-- Regra arquitetural vigente:
--   - conversations.stage  => estado operacional do Desk
--   - conversations.labels => posição no funil/Kanban
--
-- Para linhas afetadas:
--   1. copia o slug legado para labels[] quando ele ainda é uma etapa válida
--      do cliente e a conversa ainda não possui uma label de funil válida;
--   2. normaliza stage para um estado operacional inferido, ou NULL quando o
--      histórico não permite inferência segura.

WITH configured_labels AS (
  SELECT
    client_id,
    COALESCE(
      array_agg(DISTINCT label->>'slug') FILTER (WHERE COALESCE(label->>'slug', '') <> ''),
      ARRAY[]::text[]
    ) AS stage_slugs
  FROM panel_bot_config,
       LATERAL jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(stage_labels) = 'array' THEN stage_labels
           ELSE '[]'::jsonb
         END
       ) AS label
  GROUP BY client_id
),
candidates AS (
  SELECT
    conversation.id,
    conversation.stage AS legacy_funnel_stage,
    COALESCE(conversation.labels, ARRAY[]::text[]) AS current_labels,
    COALESCE(configured.stage_slugs, ARRAY[]::text[]) AS configured_slugs,
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(conversation.labels, ARRAY[]::text[])) AS existing_label
      WHERE existing_label = ANY(COALESCE(configured.stage_slugs, ARRAY[]::text[]))
    ) AS has_valid_funnel_label,
    CASE
      WHEN conversation.status = 'resolved' THEN 'resolved'
      WHEN conversation.assigned_operator_id IS NOT NULL OR conversation.last_outgoing_by = 'operator' THEN 'in_service'
      WHEN conversation.last_outgoing_by = 'ai' THEN 'bot_triage'
      ELSE NULL
    END AS normalized_operational_stage
  FROM conversations AS conversation
  LEFT JOIN configured_labels AS configured
    ON configured.client_id = conversation.client_id
  WHERE conversation.stage IS NOT NULL
    AND conversation.stage <> ALL (ARRAY['bot_triage', 'awaiting_human', 'in_service', 'resolved']::text[])
)
UPDATE conversations AS conversation
SET
  labels = CASE
    WHEN candidate.legacy_funnel_stage = ANY(candidate.configured_slugs)
      AND NOT candidate.has_valid_funnel_label
      AND NOT candidate.legacy_funnel_stage = ANY(candidate.current_labels)
    THEN array_append(candidate.current_labels, candidate.legacy_funnel_stage)
    ELSE candidate.current_labels
  END,
  stage = candidate.normalized_operational_stage
FROM candidates AS candidate
WHERE conversation.id = candidate.id;
