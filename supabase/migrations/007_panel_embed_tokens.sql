-- Migration: Embed tokens para Dashboard Apps do Chatwoot
-- Permite que admins gerem tokens de acesso para embutir kanban/agenda no Chatwoot

CREATE TABLE panel_embed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  label text,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_embed_tokens_token ON panel_embed_tokens(token);
CREATE INDEX idx_embed_tokens_user_id ON panel_embed_tokens(user_id);
CREATE INDEX idx_embed_tokens_client_id ON panel_embed_tokens(client_id);

ALTER TABLE panel_embed_tokens ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar seus próprios tokens
CREATE POLICY "Users manage own tokens"
  ON panel_embed_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role pode ler qualquer token (para validação no embed)
CREATE POLICY "Service role reads all tokens"
  ON panel_embed_tokens
  FOR SELECT
  USING (auth.role() = 'service_role');
