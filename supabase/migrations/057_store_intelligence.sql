-- Migration 057: Tabelas de Inteligência Comercial e Interesses (Store Sales MVP)
-- Cria tabelas para registrar interesses de produtos, perfis comerciais de contatos e insights extraídos por IA.

-- 1. store_conversation_products (Vínculo de produtos específicos a uma conversa)
CREATE TABLE IF NOT EXISTS store_conversation_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES store_conversations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES store_contacts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES store_products(id) ON DELETE SET NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('mentioned_by_customer', 'recommended_by_agent', 'sent_by_operator', 'asked_price', 'asked_delivery', 'purchase_intent', 'rejected')),
  confidence numeric(3,2),
  source_message_id uuid REFERENCES store_messages(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. store_contact_product_interests (Nível de interesse de um contato por produtos ou categorias)
CREATE TABLE IF NOT EXISTS store_contact_product_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES store_contacts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES store_products(id) ON DELETE SET NULL,
  category text,
  interest_score numeric(5,2) DEFAULT 0,
  intent_level text DEFAULT 'low' CHECK (intent_level IN ('low', 'medium', 'high', 'purchase_intent')),
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  source text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- 3. store_contact_profiles (Perfil comercial compilado do cliente/lead)
CREATE TABLE IF NOT EXISTS store_contact_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES store_contacts(id) ON DELETE CASCADE,
  preferred_categories text[] DEFAULT '{}',
  preferred_price_min numeric(12,2),
  preferred_price_max numeric(12,2),
  city text,
  delivery_region text,
  lifecycle_stage text DEFAULT 'lead' CHECK (lifecycle_stage IN ('lead', 'opportunity', 'customer', 'inactive')),
  last_interest_at timestamptz,
  last_purchase_at timestamptz,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT store_contact_profiles_account_contact UNIQUE (account_id, contact_id)
);

-- Trigger para updated_at em store_contact_profiles
CREATE TRIGGER store_contact_profiles_updated_at
  BEFORE UPDATE ON store_contact_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. store_message_insights (Logs de processamento de entidades extraídas na mensagem)
CREATE TABLE IF NOT EXISTS store_message_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES store_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES store_messages(id) ON DELETE CASCADE,
  intent text,
  entities jsonb DEFAULT '{}'::jsonb,
  product_mentions jsonb DEFAULT '[]'::jsonb,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  urgency text,
  sentiment text,
  confidence numeric(3,2),
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_conversation_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_contact_product_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_contact_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_message_insights ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "conv_prod_select" ON store_conversation_products FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "conv_prod_manage" ON store_conversation_products FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

CREATE POLICY "interests_select" ON store_contact_product_interests FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "interests_manage" ON store_contact_product_interests FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

CREATE POLICY "profiles_select" ON store_contact_profiles FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "profiles_manage" ON store_contact_profiles FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

CREATE POLICY "insights_select" ON store_message_insights FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "insights_manage" ON store_message_insights FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_conv_prod_lookup ON store_conversation_products(conversation_id);
CREATE INDEX IF NOT EXISTS idx_store_interests_lookup ON store_contact_product_interests(contact_id);
CREATE INDEX IF NOT EXISTS idx_store_contact_profiles_lookup ON store_contact_profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_store_message_insights_msg ON store_message_insights(message_id);
