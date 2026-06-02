-- Migration 052: Base Multi-Tenant & Access Roles (Store Sales MVP)
-- Define as tabelas de contas, perfis, membros, acessos, lojas e canais isolados.

-- 1. store_accounts (Contas Multi-Tenant)
CREATE TABLE IF NOT EXISTS store_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  document text,
  owner_name text,
  owner_email text,
  owner_phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  plan text DEFAULT 'mvp',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_accounts
CREATE TRIGGER store_accounts_updated_at
  BEFORE UPDATE ON store_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. store_user_profiles (Perfis de Usuário vinculados ao auth.users)
CREATE TABLE IF NOT EXISTS store_user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_user_profiles
CREATE TRIGGER store_user_profiles_updated_at
  BEFORE UPDATE ON store_user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. store_account_memberships (Vínculo de Usuários com Contas e Roles)
CREATE TABLE IF NOT EXISTS store_account_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES store_accounts(id) ON DELETE CASCADE, -- Null para system_admin global
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system_admin', 'client_admin', 'client_manager', 'seller', 'viewer')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Um usuário só pode ter uma role por conta
  CONSTRAINT store_account_memberships_user_account_unique UNIQUE (account_id, user_id),
  
  -- System admin pode não ter conta (global), outros papéis DEVEM ter conta
  CONSTRAINT role_account_check CHECK (
    (role = 'system_admin' AND account_id IS NULL) OR
    (role != 'system_admin' AND account_id IS NOT NULL)
  )
);

-- Trigger para updated_at em store_account_memberships
CREATE TRIGGER store_account_memberships_updated_at
  BEFORE UPDATE ON store_account_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. store_stores (Lojas Físicas/Virtuais)
CREATE TABLE IF NOT EXISTS store_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  city text,
  state text,
  address text,
  default_delivery_region text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_stores
CREATE TRIGGER store_stores_updated_at
  BEFORE UPDATE ON store_stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. store_user_store_access (Escopo de acesso de vendedores a lojas específicas)
CREATE TABLE IF NOT EXISTS store_user_store_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES store_stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_inbox boolean DEFAULT true,
  can_manage_products boolean DEFAULT false,
  can_manage_campaigns boolean DEFAULT false,
  can_manage_payments boolean DEFAULT false,
  can_manage_settings boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT store_user_store_access_store_user_unique UNIQUE (store_id, user_id)
);

-- 6. store_channels (Canais de Comunicação / Instâncias Evolution)
CREATE TABLE IF NOT EXISTS store_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'evolution',
  evolution_instance_name text NOT NULL UNIQUE,
  phone_number text,
  webhook_url text,
  purpose text DEFAULT 'sales' CHECK (purpose IN ('sales', 'support', 'campaigns', 'internal_product_capture')),
  connection_status text DEFAULT 'disconnected' CHECK (connection_status IN ('open', 'connecting', 'disconnected')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_channels
CREATE TRIGGER store_channels_updated_at
  BEFORE UPDATE ON store_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Funções Helper para RLS (Row Level Security)
-- =============================================================================

CREATE OR REPLACE FUNCTION auth.is_store_system_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_account_memberships 
    WHERE user_id = auth.uid() AND role = 'system_admin' AND is_active = true
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.get_store_user_role(p_account_id uuid)
RETURNS text AS $$
  SELECT role FROM store_account_memberships 
  WHERE user_id = auth.uid() AND account_id = p_account_id AND is_active = true
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.get_user_store_accounts()
RETURNS SETOF uuid AS $$
  SELECT account_id FROM store_account_memberships 
  WHERE user_id = auth.uid() AND is_active = true
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_account_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_user_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_channels ENABLE ROW LEVEL SECURITY;

-- Policies para store_accounts
CREATE POLICY "accounts_select" ON store_accounts FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "accounts_insert" ON store_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.is_store_system_admin());

CREATE POLICY "accounts_update" ON store_accounts FOR UPDATE TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(id) IN ('client_admin'));

CREATE POLICY "accounts_delete" ON store_accounts FOR DELETE TO authenticated
  USING (auth.is_store_system_admin());

-- Policies para store_user_profiles
CREATE POLICY "profiles_select" ON store_user_profiles FOR SELECT TO authenticated
  USING (true); -- Permite listar perfis para auto-complete/membros da equipe

CREATE POLICY "profiles_update" ON store_user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR auth.is_store_system_admin());

-- Policies para store_account_memberships
CREATE POLICY "memberships_select" ON store_account_memberships FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "memberships_insert" ON store_account_memberships FOR INSERT TO authenticated
  WITH CHECK (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin'));

CREATE POLICY "memberships_update" ON store_account_memberships FOR UPDATE TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin'));

CREATE POLICY "memberships_delete" ON store_account_memberships FOR DELETE TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin'));

-- Policies para store_stores
CREATE POLICY "stores_select" ON store_stores FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "stores_insert" ON store_stores FOR INSERT TO authenticated
  WITH CHECK (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

CREATE POLICY "stores_update" ON store_stores FOR UPDATE TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

CREATE POLICY "stores_delete" ON store_stores FOR DELETE TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin'));

-- Policies para store_user_store_access
CREATE POLICY "access_select" ON store_user_store_access FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "access_manage" ON store_user_store_access FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- Policies para store_channels
CREATE POLICY "channels_select" ON store_channels FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "channels_manage" ON store_channels FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager'));

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_account_memberships_user ON store_account_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_store_account_memberships_acc ON store_account_memberships(account_id);
CREATE INDEX IF NOT EXISTS idx_store_stores_account ON store_stores(account_id);
CREATE INDEX IF NOT EXISTS idx_store_user_store_access_user ON store_user_store_access(user_id);
CREATE INDEX IF NOT EXISTS idx_store_channels_account ON store_channels(account_id);

-- =============================================================================
-- Triggers e Backfill automático
-- =============================================================================

-- Trigger de novos usuários do Auth
CREATE OR REPLACE FUNCTION public.handle_new_store_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.store_user_profiles (id, email, display_name, is_active)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'display_name', new.email),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created_store
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_store_user();

-- Backfill dos perfis
INSERT INTO public.store_user_profiles (id, email, display_name, is_active)
SELECT id, email, COALESCE(raw_user_meta_data->>'display_name', email), true
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Backfill dos clientes herdados como contas
INSERT INTO public.store_accounts (id, name, owner_name, owner_email, owner_phone, status, created_at, updated_at)
SELECT 
  id, 
  name, 
  owner_name, 
  email, 
  phone,
  CASE WHEN status = 'paused' THEN 'paused' ELSE 'active' END::text,
  created_at,
  updated_at
FROM public.panel_clients
ON CONFLICT (id) DO NOTHING;

-- Backfill de administradores globais (role = 'admin')
INSERT INTO public.store_account_memberships (account_id, user_id, role, is_active)
SELECT 
  NULL, 
  id, 
  'system_admin'::text, 
  is_active
FROM public.panel_users
WHERE role = 'admin'
ON CONFLICT (account_id, user_id) DO NOTHING;

-- Backfill de operadores locais de clínicas/lojas (role = 'operator')
INSERT INTO public.store_account_memberships (account_id, user_id, role, is_active)
SELECT 
  client_id, 
  id, 
  CASE WHEN client_role = 'admin' THEN 'client_admin'::text ELSE 'seller'::text END, 
  is_active
FROM public.panel_users
WHERE role = 'operator' AND client_id IS NOT NULL
ON CONFLICT (account_id, user_id) DO NOTHING;
