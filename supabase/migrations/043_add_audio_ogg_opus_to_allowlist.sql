-- Migration 043: add audio/ogg;codecs=opus variants to desk-media allowlist
-- WhatsApp sends audio with MIME 'audio/ogg; codecs=opus' which must be preserved
-- so browsers can correctly decode Opus codec when serving via signed URL.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime
  FROM unnest(
    COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[]) || ARRAY[
      'audio/ogg; codecs=opus',
      'audio/ogg;codecs=opus'
    ]::text[]
  ) AS mime
  ORDER BY mime
)
WHERE id = 'desk-media';
