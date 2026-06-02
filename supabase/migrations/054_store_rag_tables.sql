-- Migration 054: Tabelas de RAG e Busca Vetorial Decoplada (Store Sales MVP)
-- Cria tabelas store_product_documents, store_product_chunks, store_product_embeddings e a função match_store_product_chunks.

-- Habilita extensão vector se necessário
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. store_product_documents (Arquivos de texto brutos dos produtos para RAG)
CREATE TABLE IF NOT EXISTS store_product_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  source_type text DEFAULT 'product_generated',
  title text,
  raw_text text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 2. store_product_chunks (Fragmentos de texto estruturados para IA)
CREATE TABLE IF NOT EXISTS store_product_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES store_product_documents(id) ON DELETE CASCADE,
  chunk_text text NOT NULL,
  chunk_index integer NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. store_product_embeddings (Vetores de embedding dos fragmentos)
CREATE TABLE IF NOT EXISTS store_product_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES store_product_chunks(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model text DEFAULT 'text-embedding-3-small',
  created_at timestamptz DEFAULT now()
);

-- 4. store_rag_query_logs (Auditoria de buscas RAG realizadas)
CREATE TABLE IF NOT EXISTS store_rag_query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  conversation_id uuid, -- Será vinculado com store_conversations.id na Sprint 4
  message_id uuid,
  query_text text NOT NULL,
  matched_product_ids uuid[] DEFAULT '{}',
  top_chunks jsonb DEFAULT '[]'::jsonb,
  score_summary jsonb DEFAULT '{}'::jsonb,
  answer_confidence numeric(3,2),
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Funções de Busca Vetorial (match_store_product_chunks)
-- =============================================================================

CREATE OR REPLACE FUNCTION match_store_product_chunks(
  p_account_id uuid,
  p_store_id uuid,
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  chunk_id uuid,
  product_id uuid,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    pe.chunk_id,
    pe.product_id,
    pc.chunk_text,
    (1 - (pe.embedding <=> query_embedding))::float AS similarity
  FROM store_product_embeddings pe
  JOIN store_product_chunks pc ON pe.chunk_id = pc.id
  WHERE pe.account_id = p_account_id
    AND (p_store_id IS NULL OR pe.store_id = p_store_id)
    AND (1 - (pe.embedding <=> query_embedding)) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- =============================================================================
-- Habilitação de RLS
-- =============================================================================

ALTER TABLE store_product_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_rag_query_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "doc_select" ON store_product_documents FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "doc_manage" ON store_product_documents FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

CREATE POLICY "chunk_select" ON store_product_chunks FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "chunk_manage" ON store_product_chunks FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

CREATE POLICY "emb_select" ON store_product_embeddings FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "emb_manage" ON store_product_embeddings FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

CREATE POLICY "rag_logs_select" ON store_rag_query_logs FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));
CREATE POLICY "rag_logs_insert" ON store_rag_query_logs FOR INSERT TO authenticated
  WITH CHECK (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_product_docs_lookup ON store_product_documents(account_id, product_id);
CREATE INDEX IF NOT EXISTS idx_store_product_chunks_lookup ON store_product_chunks(account_id, product_id);
