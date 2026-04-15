-- Migration: restore and preserve desk-media allowed MIME types after legacy overwrite
-- Date: 2026-04-15

UPDATE storage.buckets
SET
  file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 52428800),
  allowed_mime_types = ARRAY(
    SELECT DISTINCT mime
    FROM unnest(
      COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[]) || ARRAY[
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/heic',
        'image/heif',
        'application/pdf',
        'application/octet-stream',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/opus',
        'audio/webm',
        'audio/aac',
        'audio/webm;codecs=opus',
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/quicktime'
      ]::text[]
    ) AS mime
    ORDER BY mime
  )
WHERE id = 'desk-media';
