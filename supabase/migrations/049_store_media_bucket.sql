-- Migration 049: suporte a bucket público para imagens dos produtos da loja (Store Sales)
-- Cria o bucket público store-products no Supabase Storage e configura policies de RLS

-- 1. Criação do bucket público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-products',
  'store-products',
  true, -- public bucket
  10485760, -- limit file size to 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Habilitação de Policies para controle do bucket público
-- Remove policies antigas se existirem para evitar conflitos no migrate
DROP POLICY IF EXISTS "Public Read Access to store-products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert to store-products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update to store-products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete from store-products" ON storage.objects;

-- Permite leitura pública de objetos no bucket
CREATE POLICY "Public Read Access to store-products"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'store-products');

-- Permite inserção para usuários autenticados
CREATE POLICY "Authenticated Insert to store-products"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'store-products');

-- Permite atualização para usuários autenticados
CREATE POLICY "Authenticated Update to store-products"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'store-products')
WITH CHECK (bucket_id = 'store-products');

-- Permite remoção para usuários autenticados
CREATE POLICY "Authenticated Delete from store-products"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'store-products');
