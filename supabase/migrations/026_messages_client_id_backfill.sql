-- 026: Backfill messages.client_id a partir de conversations.client_id.
-- Após execução, messages.client_id não terá mais NULLs para conversas com client_id.
-- Permite simplificar filtro .or() no desk para .eq() direto.

UPDATE messages m
SET client_id = c.client_id
FROM conversations c
WHERE m.conversation_id = c.id
  AND m.client_id IS NULL
  AND c.client_id IS NOT NULL;
