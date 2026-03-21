-- Migration 002: RLS policies para tabelas panel_*
-- Acesso restrito a usuarios autenticados (admin-only app)

ALTER TABLE panel_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_google_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_audit_log ENABLE ROW LEVEL SECURITY;

-- panel_clients
CREATE POLICY "Admins podem ler panel_clients"
  ON panel_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins podem inserir panel_clients"
  ON panel_clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins podem atualizar panel_clients"
  ON panel_clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins podem deletar panel_clients"
  ON panel_clients FOR DELETE TO authenticated USING (true);

-- panel_whatsapp_config
CREATE POLICY "Admins podem ler panel_whatsapp_config"
  ON panel_whatsapp_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins podem inserir panel_whatsapp_config"
  ON panel_whatsapp_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins podem atualizar panel_whatsapp_config"
  ON panel_whatsapp_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins podem deletar panel_whatsapp_config"
  ON panel_whatsapp_config FOR DELETE TO authenticated USING (true);

-- panel_google_config
CREATE POLICY "Admins podem ler panel_google_config"
  ON panel_google_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins podem inserir panel_google_config"
  ON panel_google_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins podem atualizar panel_google_config"
  ON panel_google_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins podem deletar panel_google_config"
  ON panel_google_config FOR DELETE TO authenticated USING (true);

-- panel_bot_config
CREATE POLICY "Admins podem ler panel_bot_config"
  ON panel_bot_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins podem inserir panel_bot_config"
  ON panel_bot_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins podem atualizar panel_bot_config"
  ON panel_bot_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins podem deletar panel_bot_config"
  ON panel_bot_config FOR DELETE TO authenticated USING (true);

-- panel_health_checks
CREATE POLICY "Admins podem ler panel_health_checks"
  ON panel_health_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins podem inserir panel_health_checks"
  ON panel_health_checks FOR INSERT TO authenticated WITH CHECK (true);

-- panel_audit_log
CREATE POLICY "Admins podem ler panel_audit_log"
  ON panel_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins podem inserir panel_audit_log"
  ON panel_audit_log FOR INSERT TO authenticated WITH CHECK (true);
