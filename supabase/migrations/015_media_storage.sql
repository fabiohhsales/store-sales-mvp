-- Migration 015: suporte a mídia (imagens e PDFs)
-- Adiciona media_url em messages, intake_photo_guide_url em panel_bot_config
-- e cria o bucket privado desk-media no Supabase Storage

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url text;

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS intake_photo_guide_url text;

-- Bucket privado para mídias do Desk (fotos de pacientes, PDFs enviados/recebidos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'desk-media',
  'desk-media',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Apenas service_role acessa o bucket (signed URLs geradas no servidor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'desk-media service role'
  ) THEN
    CREATE POLICY "desk-media service role"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'desk-media');
  END IF;
END $$;
