-- 022_google_calendar_mode.sql
-- Adiciona coluna calendar_mode em panel_google_config para suporte a dual-mode:
--   google_shared: usa conta central Sales Tec (GOOGLE_REFRESH_TOKEN global)
--   google_oauth:  cliente conectou sua própria conta Google via OAuth
--   native:        agenda nativa no Supabase, sem Google Calendar

ALTER TABLE panel_google_config
  ADD COLUMN IF NOT EXISTS calendar_mode text NOT NULL DEFAULT 'google_shared'
    CHECK (calendar_mode IN ('google_shared', 'google_oauth', 'native'));
