-- Migration 018: expande allowed_mime_types do bucket desk-media
-- A migration 015 criou o bucket com ON CONFLICT (id) DO NOTHING,
-- portanto não atualizou buckets existentes. Este UPDATE garante que
-- áudios (ogg, webm, mpeg) e application/octet-stream (fallback para
-- mensagens antigas sem media_mime_type) sejam aceitos pelo Storage.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'audio/ogg', 'audio/webm', 'audio/mpeg', 'audio/mp4',
  'audio/wav', 'audio/aac',
  'application/octet-stream'
]
WHERE id = 'desk-media';
