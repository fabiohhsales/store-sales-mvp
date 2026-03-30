-- Respostas rápidas (canned responses) por cliente
-- Cada atalho (shortcut) é único por cliente; o operador digita /atalho no chat
-- e o conteúdo é inserido automaticamente no campo de mensagem.

CREATE TABLE IF NOT EXISTS canned_responses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  shortcut    text        NOT NULL CHECK (char_length(btrim(shortcut)) > 0),
  content     text        NOT NULL CHECK (char_length(btrim(content)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (client_id, shortcut)
);

CREATE INDEX IF NOT EXISTS canned_responses_client_id_idx
  ON canned_responses (client_id, shortcut);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_canned_responses_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_canned_responses_updated_at
  BEFORE UPDATE ON canned_responses
  FOR EACH ROW EXECUTE FUNCTION update_canned_responses_updated_at();
