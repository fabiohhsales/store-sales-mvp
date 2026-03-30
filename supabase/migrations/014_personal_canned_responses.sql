-- Migration 014: respostas rápidas pessoais (por operador).
-- Adiciona operator_user_id (nullable) à tabela canned_responses:
--   NULL  → resposta de cliente (compartilhada por todos os operadores)
--   UUID  → resposta pessoal do operador
--
-- A restrição UNIQUE anterior cobria (client_id, shortcut) para tudo.
-- Substituímos por dois índices parciais:
--   1. client-wide:  unicidade por (client_id, shortcut) WHERE operator_user_id IS NULL
--   2. personal:     unicidade por (client_id, operator_user_id, shortcut) WHERE operator_user_id IS NOT NULL

ALTER TABLE canned_responses
  ADD COLUMN IF NOT EXISTS operator_user_id uuid
    REFERENCES auth.users(id) ON DELETE CASCADE;

-- Remove constraint antiga (pode ter qualquer nome dependendo de como foi criada)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'canned_responses'::regclass
      AND contype = 'u'
      AND conname = 'canned_responses_client_id_shortcut_key'
  ) THEN
    ALTER TABLE canned_responses
      DROP CONSTRAINT canned_responses_client_id_shortcut_key;
  END IF;
END
$$;

-- Índice 1: atalhos de cliente são únicos por (client_id, shortcut) sem operador
CREATE UNIQUE INDEX IF NOT EXISTS canned_responses_client_wide_unique
  ON canned_responses(client_id, shortcut)
  WHERE operator_user_id IS NULL;

-- Índice 2: atalhos pessoais são únicos por (client_id, operator_user_id, shortcut)
CREATE UNIQUE INDEX IF NOT EXISTS canned_responses_personal_unique
  ON canned_responses(client_id, operator_user_id, shortcut)
  WHERE operator_user_id IS NOT NULL;

-- Remove índice antigo e recria mais abrangente
DROP INDEX IF EXISTS canned_responses_client_id_idx;
CREATE INDEX IF NOT EXISTS canned_responses_lookup_idx
  ON canned_responses(client_id, operator_user_id, shortcut);
