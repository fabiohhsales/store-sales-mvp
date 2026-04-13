-- Migration: normalize desk-media bucket after upload-limit rollout
-- Date: 2026-04-13

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = CASE
    WHEN NOT ('audio/webm;codecs=opus' = ANY(COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[])))
      THEN COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[]) || ARRAY['audio/webm;codecs=opus']::text[]
    ELSE COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[])
  END
WHERE id = 'desk-media';
