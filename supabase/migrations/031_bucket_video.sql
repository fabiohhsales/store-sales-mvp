-- Migration 031: adiciona tipos de vídeo ao bucket desk-media
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','image/heic',
  'application/pdf',
  'audio/ogg','audio/mpeg','audio/mp4','audio/opus','audio/webm','audio/aac',
  'video/mp4','video/webm','video/ogg','video/quicktime'
]
WHERE id = 'desk-media';
