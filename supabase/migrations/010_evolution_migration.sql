-- Migration 010: Migração Chatwoot → Painel Próprio (ClinDesk)
-- Remove dependência do Chatwoot no bot engine.
-- Adiciona: panel_users, client_id nas tabelas do bot, stage em conversations.
-- Mantém colunas Chatwoot existentes (nullable) para não quebrar código legado ainda ativo.

-- =============================================================================
-- 1. panel_users — controle de acesso por role (admin Sales Tec / operator clínica)
-- =============================================================================
CREATE TABLE IF NOT EXISTS panel_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator')),
  client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE,
  display_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Admin não tem client_id; Operator DEVE ter
  CONSTRAINT role_client_check CHECK (
    (role = 'admin' AND client_id IS NULL) OR
    (role = 'operator' AND client_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_panel_users_client ON panel_users(client_id);
CREATE INDEX IF NOT EXISTS idx_panel_users_role ON panel_users(role);

CREATE TRIGGER panel_users_updated_at
  BEFORE UPDATE ON panel_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. Funções helper para RLS (usadas nas policies do Desk — Sprint 2)
-- =============================================================================
CREATE OR REPLACE FUNCTION auth.user_client_id()
RETURNS uuid AS $$
  SELECT client_id FROM panel_users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text AS $$
  SELECT role FROM panel_users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- 3. contacts — torna chatwoot_id nullable, adiciona client_id
-- =============================================================================
ALTER TABLE contacts
  ALTER COLUMN chatwoot_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);

-- Unique por telefone + cliente (chave natural no novo modelo sem Chatwoot)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_client_unique
  ON contacts(phone_number, client_id)
  WHERE phone_number IS NOT NULL AND client_id IS NOT NULL;

-- =============================================================================
-- 4. conversations — adiciona client_id, stage, campos do Desk
-- =============================================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage text DEFAULT 'bot_triage'
    CHECK (stage IN ('bot_triage', 'awaiting_human', 'in_service', 'resolved')),
  ADD COLUMN IF NOT EXISTS assigned_operator_id uuid REFERENCES panel_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text;

-- Torna campos Chatwoot nullable (serão null nas conversas do novo pipeline)
ALTER TABLE conversations
  ALTER COLUMN chatwoot_conversation_id DROP NOT NULL,
  ALTER COLUMN account_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client_stage ON conversations(client_id, stage);

-- =============================================================================
-- 5. messages — adiciona client_id, evolution_message_id, torna campos Chatwoot nullable
-- =============================================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS evolution_message_id text;

-- Torna campos Chatwoot nullable
ALTER TABLE messages
  ALTER COLUMN chatwoot_message_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id);

-- Deduplicação: a mesma mensagem da Evolution não pode ser processada duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS messages_evolution_id_unique
  ON messages(evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;
