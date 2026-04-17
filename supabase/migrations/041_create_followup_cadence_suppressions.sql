-- Migration: Create followup_cadence_suppressions table
-- Date: 2026-04-13

CREATE TABLE IF NOT EXISTS followup_cadence_suppressions (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    client_id UUID NOT NULL,
    cadence_type TEXT NOT NULL,
    suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suppressed_by UUID NOT NULL,
    reason TEXT,
    released_at TIMESTAMPTZ,
    UNIQUE (conversation_id, client_id, cadence_type)
);

-- Partial unique index for active suppressions (released_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_cadence_suppressions_active
    ON followup_cadence_suppressions (conversation_id, client_id, cadence_type)
    WHERE released_at IS NULL;
