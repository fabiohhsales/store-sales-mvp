-- Migration 055: Tabelas de Importação em Lote de Produtos e Mídias (Store Sales MVP)
-- Cria tabelas para gerenciamento de importações de planilhas e upload em lote de fotos de produtos.

-- 1. store_product_import_jobs (Registro dos trabalhos de importação)
CREATE TABLE IF NOT EXISTS store_product_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_url text,
  file_name text,
  file_type text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'mapped', 'processing', 'completed', 'failed', 'cancelled')),
  total_rows integer DEFAULT 0,
  success_rows integer DEFAULT 0,
  error_rows integer DEFAULT 0,
  column_mapping jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

-- 2. store_product_import_rows (Linhas individuais da importação para validação e auditoria)
CREATE TABLE IF NOT EXISTS store_product_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES store_product_import_jobs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw_data jsonb NOT NULL,
  normalized_data jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'invalid', 'imported', 'failed')),
  error_message text,
  product_id uuid REFERENCES store_products(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. store_product_media_batches (Trabalhos de upload em lote de mídias/fotos)
CREATE TABLE IF NOT EXISTS store_product_media_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  total_files integer DEFAULT 0,
  matched_files integer DEFAULT 0,
  unmatched_files integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

-- 4. store_product_media_batch_files (Arquivos individuais no lote de mídias)
CREATE TABLE IF NOT EXISTS store_product_media_batch_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES store_product_media_batches(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text,
  match_strategy text CHECK (match_strategy IN ('sku', 'name', 'manual', 'regex')),
  matched_product_id uuid REFERENCES store_products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched', 'confirmed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_product_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_media_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_media_batch_files ENABLE ROW LEVEL SECURITY;

-- Policies para store_product_import_jobs
CREATE POLICY "import_jobs_select" ON store_product_import_jobs FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "import_jobs_manage" ON store_product_import_jobs FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_product_import_rows (Usa FK traversal via import_jobs)
CREATE POLICY "import_rows_select" ON store_product_import_rows FOR SELECT TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_product_import_jobs j
      WHERE j.id = store_product_import_rows.import_job_id
        AND j.account_id IN (SELECT auth.get_user_store_accounts())
    )
  );

CREATE POLICY "import_rows_manage" ON store_product_import_rows FOR ALL TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_product_import_jobs j
      WHERE j.id = store_product_import_rows.import_job_id
        AND auth.get_store_user_role(j.account_id) IN ('client_admin', 'client_manager')
    )
  );

-- Policies para store_product_media_batches
CREATE POLICY "media_batches_select" ON store_product_media_batches FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "media_batches_manage" ON store_product_media_batches FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_product_media_batch_files (Usa FK traversal via media_batches)
CREATE POLICY "media_files_select" ON store_product_media_batch_files FOR SELECT TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_product_media_batches b
      WHERE b.id = store_product_media_batch_files.batch_id
        AND b.account_id IN (SELECT auth.get_user_store_accounts())
    )
  );

CREATE POLICY "media_files_manage" ON store_product_media_batch_files FOR ALL TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_product_media_batches b
      WHERE b.id = store_product_media_batch_files.batch_id
        AND auth.get_store_user_role(b.account_id) IN ('client_admin', 'client_manager')
    )
  );

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_import_jobs_account ON store_product_import_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_store_import_rows_job ON store_product_import_rows(import_job_id);
CREATE INDEX IF NOT EXISTS idx_store_media_batches_account ON store_product_media_batches(account_id);
CREATE INDEX IF NOT EXISTS idx_store_media_files_batch ON store_product_media_batch_files(batch_id);
