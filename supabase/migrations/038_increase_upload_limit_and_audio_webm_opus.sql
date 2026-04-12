-- Migration: Increase desk-media upload limit to 50 MB and add audio/webm;codecs=opus
-- Date: 2026-04-12

-- Increase max file size for desk-media bucket to 52428800 (50 MB)
UPDATE storage.buckets
SET max_file_size = 52428800
WHERE id = 'desk-media';

-- Add audio/webm;codecs=opus to allowed_mime_types
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/webm;codecs=opus')
WHERE id = 'desk-media';
