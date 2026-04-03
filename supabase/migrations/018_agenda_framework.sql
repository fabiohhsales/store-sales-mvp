-- Migration 018: hardening e expansão do domínio de appointments para o framework de Agenda.
-- appointments passa a suportar sync opcional com calendários externos e status normalizado.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS external_calendar_id text,
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE appointments
SET status = 'noshow'
WHERE status = 'no_show';

UPDATE appointments
SET source = COALESCE(NULLIF(source, ''), 'supabase');

UPDATE appointments
SET sync_status = CASE
  WHEN COALESCE(external_event_id, google_event_id) IS NOT NULL THEN 'synced'
  ELSE 'pending'
END
WHERE sync_status IS NULL OR sync_status = '';

UPDATE appointments
SET external_event_id = COALESCE(external_event_id, google_event_id)
WHERE COALESCE(external_event_id, '') = '' AND google_event_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_status_check_v2'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_status_check_v2
      CHECK (status IS NULL OR status IN ('scheduled', 'confirmed', 'attended', 'noshow', 'cancelled', 'rescheduled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_sync_status_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_sync_status_check
      CHECK (sync_status IN ('disabled', 'pending', 'synced', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_conversation_start_at
  ON appointments(conversation_id, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_status_start_at
  ON appointments(status, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_external_event_id
  ON appointments(external_event_id)
  WHERE external_event_id IS NOT NULL;
