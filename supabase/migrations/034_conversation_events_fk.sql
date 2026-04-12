-- Migration 034: Add foreign key constraints to conversation_events
-- Prevents orphaned event records when conversations/clients are deleted.

ALTER TABLE conversation_events
  ADD CONSTRAINT fk_conversation_events_conversation_id
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_conversation_events_client_id
    FOREIGN KEY (client_id) REFERENCES panel_clients(id) ON DELETE CASCADE;
