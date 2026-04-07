-- Migration 021: Remove o constraint legado do Chatwoot na tabela contacts
--
-- Contexto: A tabela contacts foi criada pelo Chatwoot com um unique index
-- em (phone_number, account_id) onde account_id é o ID da conta Chatwoot.
-- Migration 010 adicionou o novo índice multi-tenant contacts_phone_client_unique
-- em (phone_number, client_id) — o correto para o novo sistema.
-- O constraint antigo não foi removido e bloqueia a inserção de novos contatos
-- via Evolution pipeline: todos têm account_id = NULL, então qualquer segundo
-- contato com o mesmo phone_number viola (phone_number, NULL) = (phone_number, NULL).

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_account_id_unique;
DROP INDEX IF EXISTS contacts_phone_account_id_unique;
