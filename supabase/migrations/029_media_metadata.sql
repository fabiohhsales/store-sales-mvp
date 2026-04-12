-- Migration 029: metadados de mídia para renderização WhatsApp-style no Desk
-- Adiciona colunas de metadata em messages e libera áudio no bucket desk-media

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS media_duration_seconds real,
  ADD COLUMN IF NOT EXISTS media_width int,
  ADD COLUMN IF NOT EXISTS media_height int;

-- Expande MIME types do bucket desk-media para incluir formatos de áudio
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','image/heic',
  'application/pdf',
  'audio/ogg','audio/mpeg','audio/mp4','audio/opus','audio/webm','audio/aac'
]
WHERE id = 'desk-media';
