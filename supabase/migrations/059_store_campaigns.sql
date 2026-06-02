-- Migration 059: Tabelas de Campanhas e Transmissões (Store Sales MVP)
-- Cria tabelas para gerenciamento de segmentos de clientes, campanhas de transmissão de WhatsApp e filas de mensagens.

-- 1. store_segments (Segmentação dinâmica ou estática de clientes)
CREATE TABLE IF NOT EXISTS store_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  rules jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_segments
CREATE TRIGGER store_segments_updated_at
  BEFORE UPDATE ON store_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. store_campaigns (Modelos e configurações de campanhas)
CREATE TABLE IF NOT EXISTS store_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  name text NOT NULL,
  message_template text NOT NULL,
  segment_id uuid REFERENCES store_segments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'paused', 'failed')),
  scheduled_at timestamptz,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_campaigns
CREATE TRIGGER store_campaigns_updated_at
  BEFORE UPDATE ON store_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. store_campaign_audiences (Público-alvo individual da campanha)
CREATE TABLE IF NOT EXISTS store_campaign_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES store_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES store_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT store_campaign_audiences_unique UNIQUE (campaign_id, contact_id)
);

-- 4. store_campaign_messages (Vincula mensagens enviadas na campanha com o histórico)
CREATE TABLE IF NOT EXISTS store_campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES store_campaigns(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES store_messages(id) ON DELETE CASCADE,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_campaign_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_campaign_messages ENABLE ROW LEVEL SECURITY;

-- Policies para store_segments
CREATE POLICY "segments_select" ON store_segments FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "segments_manage" ON store_segments FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_campaigns
CREATE POLICY "campaigns_select" ON store_campaigns FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "campaigns_manage" ON store_campaigns FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_campaign_audiences (Usa FK traversal via campaigns)
CREATE POLICY "campaign_audiences_select" ON store_campaign_audiences FOR SELECT TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_campaigns c
      WHERE c.id = store_campaign_audiences.campaign_id
        AND c.account_id IN (SELECT auth.get_user_store_accounts())
    )
  );

CREATE POLICY "campaign_audiences_manage" ON store_campaign_audiences FOR ALL TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_campaigns c
      WHERE c.id = store_campaign_audiences.campaign_id
        AND auth.get_store_user_role(c.account_id) IN ('client_admin', 'client_manager')
    )
  );

-- Policies para store_campaign_messages (Usa FK traversal via campaigns)
CREATE POLICY "campaign_messages_select" ON store_campaign_messages FOR SELECT TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_campaigns c
      WHERE c.id = store_campaign_messages.campaign_id
        AND c.account_id IN (SELECT auth.get_user_store_accounts())
    )
  );

CREATE POLICY "campaign_messages_manage" ON store_campaign_messages FOR ALL TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_campaigns c
      WHERE c.id = store_campaign_messages.campaign_id
        AND auth.get_store_user_role(c.account_id) IN ('client_admin', 'client_manager')
    )
  );

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_segments_account ON store_segments(account_id);
CREATE INDEX IF NOT EXISTS idx_store_campaigns_lookup ON store_campaigns(account_id, store_id);
CREATE INDEX IF NOT EXISTS idx_store_campaign_audiences_camp ON store_campaign_audiences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_store_campaign_messages_camp ON store_campaign_messages(campaign_id);
