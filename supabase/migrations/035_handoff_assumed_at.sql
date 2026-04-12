-- 035: Add handoff_assumed_at for real SLA measurement
-- Tracks when an operator assumes a conversation after handoff.
-- Enables computing wait time between bot transfer and human pickup.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handoff_assumed_at timestamptz;
