-- Migration: Increase desk-media upload limit to 50 MB and add audio/webm;codecs=opus
-- Date: 2026-04-12

-- Increase file size limit for desk-media bucket to 52428800 (50 MB)
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'desk-media';

-- Adiciona audio/webm;codecs=opus apenas se ainda não existir
UPDATE storage.buckets
SET allowed_mime_types = CASE
	WHEN NOT ('audio/webm;codecs=opus' = ANY(COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[])))
		THEN COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[]) || ARRAY['audio/webm;codecs=opus']::text[]
	ELSE COALESCE(array_remove(allowed_mime_types, NULL), ARRAY[]::text[])
END
WHERE id = 'desk-media';
