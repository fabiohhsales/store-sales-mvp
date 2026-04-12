-- Add event_url column to store the Google Calendar event URL (htmlLink)
-- Separate from meet_link which stores the Google Meet video call link.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS event_url text;
