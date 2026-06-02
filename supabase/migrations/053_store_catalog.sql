-- Migration 053: Reconstrução do Agente e Catálogo (Store Sales MVP)
-- Remove tabelas parciais antigas e define store_agent_settings, store_products, store_product_attributes e store_product_images com isolamento completo.

-- 1. Drop das tabelas da migration 047 para limpeza/reestruturação
DROP TABLE IF EXISTS store_order_items CASCADE;
DROP TABLE IF EXISTS store_orders CASCADE;
DROP TABLE IF EXISTS rag_query_logs CASCADE;
DROP TABLE IF EXISTS product_capture_sessions CASCADE;
DROP TABLE IF EXISTS conversation_products CASCADE;
DROP TABLE IF EXISTS product_embeddings CASCADE;
DROP TABLE IF EXISTS product_chunks CASCADE;
DROP TABLE IF EXISTS product_documents CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS product_attributes CASCADE;
DROP TABLE IF EXISTS product_category_rules CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS store_agent_settings CASCADE;
DROP TABLE IF EXISTS stores CASCADE;

-- 2. Criação da nova store_agent_settings (Configuração do agente de IA da Loja)
CREATE TABLE store_agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES store_stores(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES store_channels(id) ON DELETE SET NULL,
  agent_name text DEFAULT 'Assistente da Loja',
  tone_of_voice text DEFAULT 'consultivo, objetivo e cordial',
  auto_reply_enabled boolean DEFAULT true,
  rag_enabled boolean DEFAULT true,
  human_handoff_enabled boolean DEFAULT true,
  fallback_message text,
  handoff_rules jsonb DEFAULT '{}'::jsonb,
  business_rules jsonb DEFAULT '{}'::jsonb,
  prompt_config jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT store_agent_settings_store_unique UNIQUE (store_id)
);

CREATE TRIGGER store_agent_settings_updated_at
  BEFORE UPDATE ON store_agent_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Criação da store_products (Catálogo de Produtos)
CREATE TABLE store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  external_id text,
  source_url text,
  source_type text DEFAULT 'manual' CHECK (source_type IN ('manual', 'spreadsheet', 'url', 'whatsapp', 'api', 'scraping')),
  name text NOT NULL,
  normalized_name text,
  category text,
  subcategory text,
  brand text,
  model text,
  sku text,
  description_short text,
  description_long text,
  price_type text DEFAULT 'unknown' CHECK (price_type IN ('fixed', 'on_request', 'from', 'unknown')),
  price_amount numeric(12,2),
  price_currency text DEFAULT 'BRL',
  old_price_amount numeric(12,2),
  availability_status text DEFAULT 'unknown' CHECK (availability_status IN ('available', 'unavailable', 'made_to_order', 'unknown')),
  stock_quantity integer,
  pickup_available boolean DEFAULT true,
  delivery_available boolean DEFAULT true,
  assembly_included boolean DEFAULT false,
  delivery_region text,
  main_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs_review', 'active', 'archived')),
  confidence numeric(3,2),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER store_products_updated_at
  BEFORE UPDATE ON store_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Criação da store_product_attributes (Atributos dos Produtos)
CREATE TABLE store_product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  attribute_name text NOT NULL,
  attribute_value text NOT NULL,
  unit text,
  source text DEFAULT 'manual',
  confidence numeric(3,2),
  created_at timestamptz DEFAULT now()
);

-- 5. Criação da store_product_images (Imagens extras dos produtos)
CREATE TABLE store_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  storage_path text,
  public_url text,
  original_filename text,
  alt_text text,
  is_main boolean DEFAULT false,
  position integer DEFAULT 0,
  source text DEFAULT 'manual',
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_images ENABLE ROW LEVEL SECURITY;

-- Policies para store_agent_settings
CREATE POLICY "agent_settings_select" ON store_agent_settings FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "agent_settings_manage" ON store_agent_settings FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_products
CREATE POLICY "products_select" ON store_products FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "products_manage" ON store_products FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_product_attributes
CREATE POLICY "attributes_select" ON store_product_attributes FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "attributes_manage" ON store_product_attributes FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_product_images
CREATE POLICY "product_images_select" ON store_product_images FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "product_images_manage" ON store_product_images FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_products_account_store ON store_products(account_id, store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_sku ON store_products(sku);
CREATE INDEX IF NOT EXISTS idx_store_product_attributes_prod ON store_product_attributes(product_id);
CREATE INDEX IF NOT EXISTS idx_store_product_images_prod ON store_product_images(product_id);
