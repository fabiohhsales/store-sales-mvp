-- Migration 056: Tabelas de Conversas, Mensagens e Contatos da Loja (Store Sales MVP)
-- Cria tabelas isoladas para gerenciar a comunicação WhatsApp das lojas, contatos e histórico.

-- 1. store_contacts (Contatos / Leads de Vendas da Loja)
CREATE TABLE IF NOT EXISTS store_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  name text,
  phone_number text NOT NULL,
  remote_jid text,
  email text,
  city text,
  state text,
  tags text[] DEFAULT '{}',
  custom_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Telefone único por conta
  CONSTRAINT store_contacts_account_phone_unique UNIQUE (account_id, phone_number)
);

-- Trigger para updated_at em store_contacts
CREATE TRIGGER store_contacts_updated_at
  BEFORE UPDATE ON store_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. store_conversations (Conversas de Vendas e Status)
CREATE TABLE IF NOT EXISTS store_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES store_channels(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES store_contacts(id) ON DELETE CASCADE,

  operational_status text DEFAULT 'bot_active'
    CHECK (operational_status IN ('bot_active', 'awaiting_human', 'in_service', 'resolved', 'paused')),
  
  commercial_stage text DEFAULT 'new_lead'
    CHECK (commercial_stage IN (
      'new_lead',
      'product_discovery',
      'product_recommended',
      'price_requested',
      'quote_requested',
      'payment_link_sent',
      'negotiation',
      'won',
      'lost'
    )),

  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  summary text,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  last_intent text,
  handoff_reason text,
  lost_reason text,
  won_at timestamptz,
  resolved_at timestamptz,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_conversations
CREATE TRIGGER store_conversations_updated_at
  BEFORE UPDATE ON store_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. store_messages (Histórico de Mensagens)
CREATE TABLE IF NOT EXISTS store_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES store_conversations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES store_contacts(id) ON DELETE SET NULL,

  evolution_message_id text,
  remote_jid text,
  from_who text NOT NULL CHECK (from_who IN ('lead', 'ai', 'human', 'system')),
  sender_type text,
  content text,
  content_type text DEFAULT 'text',
  media_url text,
  media_mime_type text,
  raw_payload jsonb,
  ai_input_text text,

  whatsapp_status text,
  created_at timestamptz DEFAULT now(),
  
  -- Evitar duplicados de webhooks simultâneos
  CONSTRAINT store_messages_evolution_unique UNIQUE (evolution_message_id)
);

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_messages ENABLE ROW LEVEL SECURITY;

-- Policies para store_contacts
CREATE POLICY "contacts_select" ON store_contacts FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "contacts_manage" ON store_contacts FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

-- Policies para store_conversations
CREATE POLICY "conversations_select" ON store_conversations FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "conversations_manage" ON store_conversations FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

-- Policies para store_messages
CREATE POLICY "messages_select" ON store_messages FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "messages_manage" ON store_messages FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_contacts_phone ON store_contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_store_conversations_status ON store_conversations(account_id, store_id, operational_status);
CREATE INDEX IF NOT EXISTS idx_store_conversations_stage ON store_conversations(account_id, store_id, commercial_stage);
CREATE INDEX IF NOT EXISTS idx_store_messages_conv ON store_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_store_messages_evolution ON store_messages(evolution_message_id);
