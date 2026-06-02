-- Migration 058: Tabelas de Pedidos e Pagamentos (Store Sales MVP)
-- Cria tabelas para gerenciamento de pedidos (checkout), integrações com Stripe/AbacatePay e logs de pagamentos.

-- 1. store_payment_integrations (Credenciais de meios de pagamentos por conta)
CREATE TABLE IF NOT EXISTS store_payment_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'abacatepay')),
  api_key text,
  webhook_secret text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT store_payment_integrations_acc_provider_unique UNIQUE (account_id, provider)
);

-- Trigger para updated_at em store_payment_integrations
CREATE TRIGGER store_payment_integrations_updated_at
  BEFORE UPDATE ON store_payment_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. store_orders (Pedidos da Loja)
CREATE TABLE IF NOT EXISTS store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES store_stores(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES store_contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES store_conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  total_amount numeric(12,2) NOT NULL,
  payment_method text CHECK (payment_method IN ('pix', 'credit_card', 'unknown')),
  payment_provider text CHECK (payment_provider IN ('stripe', 'abacatepay')),
  provider_payment_id text,
  payment_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_orders
CREATE TRIGGER store_orders_updated_at
  BEFORE UPDATE ON store_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. store_order_items (Itens dos Pedidos)
CREATE TABLE IF NOT EXISTS store_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_amount numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4. store_payments (Transações Pix/Cartão e Status)
CREATE TABLE IF NOT EXISTS store_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES store_accounts(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  transaction_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em store_payments
CREATE TRIGGER store_payments_updated_at
  BEFORE UPDATE ON store_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Habilitação e Configuração do RLS (Segurança Multi-Tenant)
-- =============================================================================

ALTER TABLE store_payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_payments ENABLE ROW LEVEL SECURITY;

-- Policies para store_payment_integrations
CREATE POLICY "payment_integrations_select" ON store_payment_integrations FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "payment_integrations_manage" ON store_payment_integrations FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin'));

-- Policies para store_orders
CREATE POLICY "orders_select" ON store_orders FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "orders_manage" ON store_orders FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

-- Policies para store_order_items (Usa FK traversal via orders)
CREATE POLICY "order_items_select" ON store_order_items FOR SELECT TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_orders o
      WHERE o.id = store_order_items.order_id
        AND o.account_id IN (SELECT auth.get_user_store_accounts())
    )
  );

CREATE POLICY "order_items_manage" ON store_order_items FOR ALL TO authenticated
  USING (
    auth.is_store_system_admin()
    OR EXISTS (
      SELECT 1 FROM store_orders o
      WHERE o.id = store_order_items.order_id
        AND auth.get_store_user_role(o.account_id) IN ('client_admin', 'client_manager', 'seller')
    )
  );

-- Policies para store_payments
CREATE POLICY "payments_select" ON store_payments FOR SELECT TO authenticated
  USING (auth.is_store_system_admin() OR account_id IN (SELECT auth.get_user_store_accounts()));

CREATE POLICY "payments_manage" ON store_payments FOR ALL TO authenticated
  USING (auth.is_store_system_admin() OR auth.get_store_user_role(account_id) IN ('client_admin', 'client_manager', 'seller'));

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_orders_lookup ON store_orders(account_id, store_id);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order ON store_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_store_payments_order ON store_payments(order_id);
