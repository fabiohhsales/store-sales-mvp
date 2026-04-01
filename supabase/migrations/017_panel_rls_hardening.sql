-- Migration 017: Hardening RLS para tabelas panel_*
-- Objetivo: restringir escrita a admins e limitar leitura de operadores ao próprio client_id.

-- Garantia de RLS habilitado
ALTER TABLE panel_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_google_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_audit_log ENABLE ROW LEVEL SECURITY;

-- Remove policies amplas da migration 002
DROP POLICY IF EXISTS "Admins podem ler panel_clients" ON panel_clients;
DROP POLICY IF EXISTS "Admins podem inserir panel_clients" ON panel_clients;
DROP POLICY IF EXISTS "Admins podem atualizar panel_clients" ON panel_clients;
DROP POLICY IF EXISTS "Admins podem deletar panel_clients" ON panel_clients;

DROP POLICY IF EXISTS "Admins podem ler panel_whatsapp_config" ON panel_whatsapp_config;
DROP POLICY IF EXISTS "Admins podem inserir panel_whatsapp_config" ON panel_whatsapp_config;
DROP POLICY IF EXISTS "Admins podem atualizar panel_whatsapp_config" ON panel_whatsapp_config;
DROP POLICY IF EXISTS "Admins podem deletar panel_whatsapp_config" ON panel_whatsapp_config;

DROP POLICY IF EXISTS "Admins podem ler panel_google_config" ON panel_google_config;
DROP POLICY IF EXISTS "Admins podem inserir panel_google_config" ON panel_google_config;
DROP POLICY IF EXISTS "Admins podem atualizar panel_google_config" ON panel_google_config;
DROP POLICY IF EXISTS "Admins podem deletar panel_google_config" ON panel_google_config;

DROP POLICY IF EXISTS "Admins podem ler panel_bot_config" ON panel_bot_config;
DROP POLICY IF EXISTS "Admins podem inserir panel_bot_config" ON panel_bot_config;
DROP POLICY IF EXISTS "Admins podem atualizar panel_bot_config" ON panel_bot_config;
DROP POLICY IF EXISTS "Admins podem deletar panel_bot_config" ON panel_bot_config;

DROP POLICY IF EXISTS "Admins podem ler panel_health_checks" ON panel_health_checks;
DROP POLICY IF EXISTS "Admins podem inserir panel_health_checks" ON panel_health_checks;

DROP POLICY IF EXISTS "Admins podem ler panel_audit_log" ON panel_audit_log;
DROP POLICY IF EXISTS "Admins podem inserir panel_audit_log" ON panel_audit_log;

-- panel_clients
CREATE POLICY "panel_clients_select_scoped"
  ON panel_clients FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR id = auth.user_client_id()
  );

CREATE POLICY "panel_clients_insert_admin"
  ON panel_clients FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_clients_update_admin"
  ON panel_clients FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_clients_delete_admin"
  ON panel_clients FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- panel_whatsapp_config
CREATE POLICY "panel_whatsapp_config_select_scoped"
  ON panel_whatsapp_config FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "panel_whatsapp_config_insert_admin"
  ON panel_whatsapp_config FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_whatsapp_config_update_admin"
  ON panel_whatsapp_config FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_whatsapp_config_delete_admin"
  ON panel_whatsapp_config FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- panel_google_config
CREATE POLICY "panel_google_config_select_scoped"
  ON panel_google_config FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "panel_google_config_insert_admin"
  ON panel_google_config FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_google_config_update_admin"
  ON panel_google_config FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_google_config_delete_admin"
  ON panel_google_config FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- panel_bot_config
CREATE POLICY "panel_bot_config_select_scoped"
  ON panel_bot_config FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    OR client_id = auth.user_client_id()
  );

CREATE POLICY "panel_bot_config_insert_admin"
  ON panel_bot_config FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_bot_config_update_admin"
  ON panel_bot_config FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY "panel_bot_config_delete_admin"
  ON panel_bot_config FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- panel_health_checks
CREATE POLICY "panel_health_checks_select_admin"
  ON panel_health_checks FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin');

CREATE POLICY "panel_health_checks_insert_admin"
  ON panel_health_checks FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');

-- panel_audit_log
CREATE POLICY "panel_audit_log_select_admin"
  ON panel_audit_log FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin');

CREATE POLICY "panel_audit_log_insert_admin"
  ON panel_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');
