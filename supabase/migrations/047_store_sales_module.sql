-- Migration 047: Módulo de Loja (Store Sales) e Pagamentos (Stripe / AbacatePay)
-- Cria tabelas dedicadas ao e-commerce de móveis e eletrodomésticos com isolamento por client_id

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- 1. Criação das Tabelas
-- =============================================================================

-- Tabela stores (Lojas/Unidades)
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  city text,
  state text,
  default_delivery_region text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela store_agent_settings (Configuração do agente de IA da Loja)
CREATE TABLE IF NOT EXISTS store_agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  whatsapp_config_id uuid NOT NULL REFERENCES panel_whatsapp_config(id) ON DELETE CASCADE,
  agent_name text DEFAULT 'Assistente da Loja',
  tone_of_voice text DEFAULT 'consultivo, objetivo e cordial',
  auto_reply_enabled boolean DEFAULT true,
  rag_enabled boolean DEFAULT true,
  human_handoff_enabled boolean DEFAULT true,
  fallback_message text,
  handoff_rules jsonb DEFAULT '{}'::jsonb,
  business_rules jsonb DEFAULT '{}'::jsonb,
  prompt_config jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela products (Produtos)
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  external_id text,
  source_url text,
  source_type text DEFAULT 'manual',
  name text NOT NULL,
  normalized_name text,
  category text,
  subcategory text,
  brand text,
  model text,
  sku text,
  description_short text,
  description_long text,
  price_type text DEFAULT 'unknown',
  price_amount numeric(12,2),
  price_currency text DEFAULT 'BRL',
  old_price_amount numeric(12,2),
  availability_status text DEFAULT 'unknown',
  stock_quantity integer,
  pickup_available boolean,
  delivery_available boolean,
  assembly_included boolean,
  delivery_region text,
  main_image_url text,
  status text NOT NULL DEFAULT 'draft',
  confidence numeric(3,2),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela product_attributes (Atributos detalhados dos produtos)
CREATE TABLE IF NOT EXISTS product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  value text NOT NULL,
  unit text,
  value_type text DEFAULT 'text',
  confidence numeric(3,2),
  source text DEFAULT 'manual',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela product_category_rules (Campos sugeridos/obrigatórios de produtos por categoria)
CREATE TABLE IF NOT EXISTS product_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  required_attributes jsonb DEFAULT '[]'::jsonb,
  optional_attributes jsonb DEFAULT '[]'::jsonb,
  examples jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela product_images (Imagens extras do produto)
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text,
  storage_path text,
  alt_text text,
  is_main boolean DEFAULT false,
  position integer DEFAULT 0,
  source text DEFAULT 'manual',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Tabela product_sources (Auditoria de scraping ou ingestão)
CREATE TABLE IF NOT EXISTS product_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_url text,
  source_name text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  extraction_status text DEFAULT 'pending',
  extracted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Tabela product_documents (Arquivos de texto brutos para RAG)
CREATE TABLE IF NOT EXISTS product_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  source_id uuid REFERENCES product_sources(id) ON DELETE SET NULL,
  title text,
  source_type text,
  source_url text,
  raw_text text,
  normalized_text text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'ready',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela product_chunks (Divisão do texto em fragmentos legíveis por IA)
CREATE TABLE IF NOT EXISTS product_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  document_id uuid REFERENCES product_documents(id) ON DELETE CASCADE,
  chunk_text text NOT NULL,
  chunk_index integer NOT NULL,
  token_count integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Tabela product_embeddings (Embeddings dos chunks para busca vetorial)
CREATE TABLE IF NOT EXISTS product_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES product_chunks(id) ON DELETE CASCADE,
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz DEFAULT now()
);

-- Tabela conversation_products (Vincula conversas a produtos de interesse)
CREATE TABLE IF NOT EXISTS conversation_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  confidence numeric(3,2),
  source text DEFAULT 'agent',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Tabela product_capture_sessions (Sessão para complementar dados de produto)
CREATE TABLE IF NOT EXISTS product_capture_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  current_step text,
  status text DEFAULT 'draft',
  extracted_json jsonb DEFAULT '{}'::jsonb,
  missing_fields jsonb DEFAULT '[]'::jsonb,
  last_user_message text,
  last_agent_message text,
  confidence numeric(3,2),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela rag_query_logs (Auditoria das buscas semânticas da IA)
CREATE TABLE IF NOT EXISTS rag_query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  query_text text NOT NULL,
  matched_chunk_ids jsonb DEFAULT '[]'::jsonb,
  matched_product_ids jsonb DEFAULT '[]'::jsonb,
  top_k integer,
  score_summary jsonb DEFAULT '{}'::jsonb,
  answer_generated text,
  confidence numeric(3,2),
  fallback_used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Tabela store_orders (Pedidos/Ordens de Venda)
CREATE TABLE IF NOT EXISTS store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, paid, cancelled, refunded
  total_amount numeric(12,2) NOT NULL,
  payment_method text, -- pix, credit_card
  payment_provider text, -- stripe, abacatepay
  provider_payment_id text, -- ID externo da transação
  payment_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela store_order_items (Itens de Pedidos/Ordens de Venda)
CREATE TABLE IF NOT EXISTS store_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  price_amount numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 2. Habilitação de RLS (Row Level Security)
-- =============================================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_order_items ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Criação de Policies RLS (Segurança Multi-Tenant)
-- =============================================================================

-- Função helper para simplificar escrita das policies (reaproveitando políticas do Chat Sales)
-- SELECT/INSERT/UPDATE mapeados de acordo com o client_id ou se o usuário for administrador

-- stores
CREATE POLICY "stores_select_scoped" ON stores FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "stores_insert_scoped" ON stores FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "stores_update_scoped" ON stores FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "stores_delete_admin" ON stores FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- store_agent_settings
CREATE POLICY "settings_select_scoped" ON store_agent_settings FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "settings_insert_scoped" ON store_agent_settings FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "settings_update_scoped" ON store_agent_settings FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "settings_delete_admin" ON store_agent_settings FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- products
CREATE POLICY "products_select_scoped" ON products FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "products_insert_scoped" ON products FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "products_update_scoped" ON products FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "products_delete_scoped" ON products FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- product_attributes
CREATE POLICY "attributes_select_scoped" ON product_attributes FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "attributes_insert_scoped" ON product_attributes FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "attributes_update_scoped" ON product_attributes FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "attributes_delete_scoped" ON product_attributes FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- product_category_rules
CREATE POLICY "cat_rules_select_scoped" ON product_category_rules FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "cat_rules_insert_scoped" ON product_category_rules FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "cat_rules_update_scoped" ON product_category_rules FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "cat_rules_delete_admin" ON product_category_rules FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- product_images
CREATE POLICY "images_select_scoped" ON product_images FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "images_insert_scoped" ON product_images FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "images_update_scoped" ON product_images FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "images_delete_scoped" ON product_images FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- product_sources
CREATE POLICY "sources_select_scoped" ON product_sources FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "sources_insert_scoped" ON product_sources FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "sources_update_scoped" ON product_sources FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "sources_delete_admin" ON product_sources FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- product_documents
CREATE POLICY "documents_select_scoped" ON product_documents FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "documents_insert_scoped" ON product_documents FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "documents_update_scoped" ON product_documents FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "documents_delete_scoped" ON product_documents FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- product_chunks
CREATE POLICY "chunks_select_scoped" ON product_chunks FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "chunks_insert_scoped" ON product_chunks FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "chunks_update_scoped" ON product_chunks FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "chunks_delete_scoped" ON product_chunks FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- product_embeddings
CREATE POLICY "embeddings_select_scoped" ON product_embeddings FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "embeddings_insert_scoped" ON product_embeddings FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "embeddings_update_scoped" ON product_embeddings FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "embeddings_delete_scoped" ON product_embeddings FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- conversation_products
CREATE POLICY "conv_prod_select_scoped" ON conversation_products FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "conv_prod_insert_scoped" ON conversation_products FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "conv_prod_update_scoped" ON conversation_products FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "conv_prod_delete_scoped" ON conversation_products FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- product_capture_sessions
CREATE POLICY "capture_select_scoped" ON product_capture_sessions FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "capture_insert_scoped" ON product_capture_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "capture_update_scoped" ON product_capture_sessions FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "capture_delete_scoped" ON product_capture_sessions FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());

-- rag_query_logs
CREATE POLICY "rag_logs_select_scoped" ON rag_query_logs FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "rag_logs_insert_scoped" ON rag_query_logs FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "rag_logs_delete_admin" ON rag_query_logs FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- store_orders
CREATE POLICY "orders_select_scoped" ON store_orders FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "orders_insert_scoped" ON store_orders FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "orders_update_scoped" ON store_orders FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin' OR client_id = auth.user_client_id())
  WITH CHECK (auth.user_role() = 'admin' OR client_id = auth.user_client_id());
CREATE POLICY "orders_delete_admin" ON store_orders FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- store_order_items (Usa FK traversal via orders)
CREATE POLICY "order_items_select_scoped" ON store_order_items FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM store_orders o
      WHERE o.id = store_order_items.order_id
        AND o.client_id = auth.user_client_id()
    )
  );
CREATE POLICY "order_items_insert_scoped" ON store_order_items FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM store_orders o
      WHERE o.id = store_order_items.order_id
        AND o.client_id = auth.user_client_id()
    )
  );
CREATE POLICY "order_items_delete_admin" ON store_order_items FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================================
-- 4. Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_stores_client ON stores(client_id);

CREATE INDEX IF NOT EXISTS idx_products_client_store_status
  ON products(client_id, store_id, status);

CREATE INDEX IF NOT EXISTS idx_products_client_category
  ON products(client_id, category);

CREATE INDEX IF NOT EXISTS idx_product_attributes_product
  ON product_attributes(product_id);

CREATE INDEX IF NOT EXISTS idx_product_attributes_lookup
  ON product_attributes(client_id, store_id, name);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON product_images(product_id);

CREATE INDEX IF NOT EXISTS idx_product_documents_product
  ON product_documents(product_id);

CREATE INDEX IF NOT EXISTS idx_product_chunks_lookup
  ON product_chunks(client_id, store_id, product_id);

CREATE INDEX IF NOT EXISTS idx_conversation_products_conversation
  ON conversation_products(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_products_product
  ON conversation_products(product_id);

CREATE INDEX IF NOT EXISTS idx_product_capture_sessions_conversation
  ON product_capture_sessions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_rag_query_logs_conversation
  ON rag_query_logs(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_orders_client_contact
  ON store_orders(client_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_store_orders_provider_payment
  ON store_orders(payment_provider, provider_payment_id);
