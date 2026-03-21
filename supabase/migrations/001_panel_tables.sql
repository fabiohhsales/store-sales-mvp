-- Migration 001: Criacao das tabelas panel_*
-- Painel Admin Multi-Tenant (Sales Tec)

-- Funcao para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- panel_clients
-- =============================================================================
CREATE TABLE panel_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_name text NOT NULL,
  phone text,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_whatsapp', 'pending_google', 'configuring', 'active', 'paused', 'disconnected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER panel_clients_updated_at
  BEFORE UPDATE ON panel_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- panel_whatsapp_config
-- =============================================================================
CREATE TABLE panel_whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES panel_clients(id) ON DELETE CASCADE,
  evolution_instance_name text UNIQUE NOT NULL,
  evolution_instance_id text,
  evolution_instance_token text,
  connection_status text DEFAULT 'disconnected'
    CHECK (connection_status IN ('open', 'connecting', 'disconnected')),
  connected_phone text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  webhook_url text,
  chatwoot_inbox_id integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER panel_whatsapp_config_updated_at
  BEFORE UPDATE ON panel_whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- panel_google_config
-- =============================================================================
CREATE TABLE panel_google_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES panel_clients(id) ON DELETE CASCADE,
  google_email text,
  calendar_id text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scopes text[] DEFAULT '{https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events}',
  authorized_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER panel_google_config_updated_at
  BEFORE UPDATE ON panel_google_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- panel_bot_config
-- =============================================================================
CREATE TABLE panel_bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES panel_clients(id) ON DELETE CASCADE,

  -- Perfil do profissional/negocio
  professional_name text NOT NULL,
  professional_title text,
  professional_register text,
  business_name text,
  business_segment text
    CHECK (business_segment IS NULL OR business_segment IN ('medicina', 'odontologia', 'psicologia', 'fisioterapia', 'estetica', 'outro')),
  business_address text,
  business_phone text,

  -- Servicos oferecidos
  services jsonb NOT NULL DEFAULT '[]',

  -- Horarios de atendimento
  working_hours jsonb NOT NULL,
  appointment_duration_default integer NOT NULL DEFAULT 60,
  appointment_buffer_minutes integer DEFAULT 15,
  max_advance_booking_days integer DEFAULT 60,
  min_advance_booking_hours integer DEFAULT 2,
  allow_same_day_booking boolean DEFAULT true,

  -- Personalidade e comportamento do AI Agent
  ai_greeting_message text,
  ai_tone text DEFAULT 'professional_friendly'
    CHECK (ai_tone IN ('formal', 'professional_friendly', 'casual', 'empathetic')),
  ai_language text DEFAULT 'pt-BR',
  ai_custom_instructions text,
  ai_fallback_message text,
  ai_handoff_message text,

  -- Mensagens automaticas (follow-up pipeline)
  followup_enabled boolean DEFAULT true,
  followup_confirmation_hours_before integer DEFAULT 24,
  followup_reminder_hours_before integer DEFAULT 2,
  followup_noshow_enabled boolean DEFAULT true,
  msg_confirmation text,
  msg_reminder text,
  msg_noshow text,
  msg_outside_hours text,

  -- Regras de handoff
  handoff_on_negative_sentiment boolean DEFAULT true,
  handoff_on_medical_urgency boolean DEFAULT true,
  handoff_on_unknown_intent boolean DEFAULT false,
  handoff_max_ai_turns integer DEFAULT 20,
  handoff_keywords text[] DEFAULT '{}',

  -- Google Calendar
  calendar_event_title_template text DEFAULT 'Consulta {service_name} — {patient_name}',
  calendar_event_description_template text,
  calendar_create_meet_link boolean DEFAULT false,
  calendar_send_invite_to_patient boolean DEFAULT false,
  calendar_color_id text,

  -- Chatwoot
  chatwoot_auto_resolve_hours integer DEFAULT 24,
  chatwoot_working_hours_enabled boolean DEFAULT true,
  chatwoot_assign_to_agent_id integer,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER panel_bot_config_updated_at
  BEFORE UPDATE ON panel_bot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- panel_health_checks
-- =============================================================================
CREATE TABLE panel_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE,
  service text NOT NULL
    CHECK (service IN ('whatsapp', 'google_calendar', 'chatwoot')),
  status text NOT NULL
    CHECK (status IN ('ok', 'warning', 'error')),
  details text,
  response_time_ms integer,
  checked_at timestamptz DEFAULT now()
);

-- =============================================================================
-- panel_audit_log
-- =============================================================================
CREATE TABLE panel_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  action text NOT NULL,
  client_id uuid REFERENCES panel_clients(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indices para queries frequentes
CREATE INDEX idx_panel_health_checks_client_id ON panel_health_checks(client_id);
CREATE INDEX idx_panel_health_checks_checked_at ON panel_health_checks(checked_at DESC);
CREATE INDEX idx_panel_audit_log_client_id ON panel_audit_log(client_id);
CREATE INDEX idx_panel_audit_log_created_at ON panel_audit_log(created_at DESC);
CREATE INDEX idx_panel_whatsapp_config_instance_name ON panel_whatsapp_config(evolution_instance_name);
