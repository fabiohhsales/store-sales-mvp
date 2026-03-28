-- Migration 007: agentes Chatwoot provisionados no onboarding

ALTER TABLE panel_clients
  ADD COLUMN IF NOT EXISTS provisioned_agents jsonb NOT NULL DEFAULT '[]'::jsonb;
