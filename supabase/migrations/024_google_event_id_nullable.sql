-- Migration 024: Torna google_event_id nullable em appointments.
--
-- Contexto: A coluna google_event_id é legado (Chatwoot). Migration 018
-- introduziu external_event_id como coluna canônica para novos writes.
-- createAgendaAppointment intencionalmente não escreve google_event_id,
-- mas a constraint NOT NULL original do Chatwoot bloqueia o INSERT.
-- mapAppointmentRow já lê via fallback chain: external_event_id ?? google_event_id.

ALTER TABLE appointments
  ALTER COLUMN google_event_id DROP NOT NULL;
