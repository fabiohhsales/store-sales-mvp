-- Migration 030: transcrição de áudio (Whisper) + status de entrega WhatsApp
-- media_transcript — texto transcrito pelo Whisper (mensagens de áudio inbound)
-- whatsapp_status  — rastreamento de entrega: sent | delivered | read | played

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_transcript text,
  ADD COLUMN IF NOT EXISTS whatsapp_status text;
