-- Migration: Increase desk-media upload limit to 50 MB and add audio/webm;codecs=opus
-- Date: 2026-04-12

-- Increase max file size for desk-media bucket to 52428800 (50 MB)
UPDATE storage.buckets
SET max_file_size = 52428800
WHERE id = 'desk-media';

-- Adiciona audio/webm;codecs=opus apenas se ainda não existir
UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY[
	CASE WHEN NOT ('audio/webm;codecs=opus' = ANY(allowed_mime_types))
		THEN 'audio/webm;codecs=opus'
		ELSE NULL END
]::text[]
WHERE id = 'desk-media';
