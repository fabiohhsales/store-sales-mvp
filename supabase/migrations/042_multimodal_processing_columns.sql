-- Migration 042: rastreabilidade multimodal em messages
-- Mantem content como bruto/original e adiciona trilha derivada para audio/imagem.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS derived_text text,
  ADD COLUMN IF NOT EXISTS derived_kind text,
  ADD COLUMN IF NOT EXISTS processing_status text,
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS ai_input_text text,
  ADD COLUMN IF NOT EXISTS sent_to_agent_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_processing_status_multimodal_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_processing_status_multimodal_check
      CHECK (
        processing_status IS NULL OR
        processing_status IN ('not_required', 'received', 'downloaded', 'processed', 'failed')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_derived_kind_multimodal_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_derived_kind_multimodal_check
      CHECK (
        derived_kind IS NULL OR
        derived_kind IN ('transcription', 'vision_analysis')
      );
  END IF;
END $$;

-- Backfill de compatibilidade para audios ja transcritos.
UPDATE messages
SET
  derived_kind = COALESCE(derived_kind, 'transcription'),
  derived_text = COALESCE(derived_text, media_transcript),
  processing_status = COALESCE(processing_status, 'processed'),
  processing_error = NULL,
  ai_input_text = COALESCE(ai_input_text, 'Transcrição do áudio do contato: ' || media_transcript)
WHERE content_type = 'audio'
  AND media_transcript IS NOT NULL
  AND btrim(media_transcript) <> '';

-- Backfill leve para mensagens sem processamento multimodal.
UPDATE messages
SET
  processing_status = COALESCE(processing_status, 'not_required'),
  ai_input_text = COALESCE(ai_input_text, content)
WHERE content_type IN ('text', 'document', 'video')
  AND (processing_status IS NULL OR ai_input_text IS NULL);
