// Executa a migration 010 no Supabase via API
// Uso: node scripts/run-migration-010.mjs

const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const BASE = 'https://chatsales-supabase.yvssrw.easypanel.host';

async function q(label, sql) {
  const r = await fetch(BASE + '/pg/query', {
    method: 'POST',
    headers: {
      'apikey': SRK,
      'Authorization': 'Bearer ' + SRK,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const d = await r.json();
  if (d.error || (Array.isArray(d) && d[0]?.error)) {
    console.error(`❌ ${label}:`, JSON.stringify(d));
    process.exit(1);
  }
  console.log(`✅ ${label}`);
}

(async () => {
  console.log('🚀 Executando migration 010...\n');

  // --- 1. panel_users ---
  await q('panel_users: criar tabela', `
    CREATE TABLE IF NOT EXISTS panel_users (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      role text NOT NULL CHECK (role IN ('admin', 'operator')),
      client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE,
      display_name text,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT role_client_check CHECK (
        (role = 'admin' AND client_id IS NULL) OR
        (role = 'operator' AND client_id IS NOT NULL)
      )
    )
  `);

  await q('panel_users: índice client', `
    CREATE INDEX IF NOT EXISTS idx_panel_users_client ON panel_users(client_id)
  `);

  await q('panel_users: índice role', `
    CREATE INDEX IF NOT EXISTS idx_panel_users_role ON panel_users(role)
  `);

  await q('panel_users: trigger updated_at', `
    CREATE OR REPLACE TRIGGER panel_users_updated_at
      BEFORE UPDATE ON panel_users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  // --- 2. RLS helper functions ---
  await q('RLS: auth.user_client_id()', `
    CREATE OR REPLACE FUNCTION auth.user_client_id()
    RETURNS uuid AS $$
      SELECT client_id FROM panel_users WHERE id = auth.uid()
    $$ LANGUAGE sql SECURITY DEFINER STABLE
  `);

  await q('RLS: auth.user_role()', `
    CREATE OR REPLACE FUNCTION auth.user_role()
    RETURNS text AS $$
      SELECT role FROM panel_users WHERE id = auth.uid()
    $$ LANGUAGE sql SECURITY DEFINER STABLE
  `);

  // --- 3. contacts ---
  await q('contacts: chatwoot_id nullable', `
    ALTER TABLE contacts ALTER COLUMN chatwoot_id DROP NOT NULL
  `);

  await q('contacts: adicionar client_id', `
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE
  `);

  await q('contacts: índice client_id', `
    CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id)
  `);

  await q('contacts: unique phone+client', `
    CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_client_unique
      ON contacts(phone_number, client_id)
      WHERE phone_number IS NOT NULL AND client_id IS NOT NULL
  `);

  // --- 4. conversations ---
  await q('conversations: chatwoot_conversation_id nullable', `
    ALTER TABLE conversations ALTER COLUMN chatwoot_conversation_id DROP NOT NULL
  `);

  await q('conversations: account_id nullable', `
    ALTER TABLE conversations ALTER COLUMN account_id DROP NOT NULL
  `);

  await q('conversations: adicionar client_id', `
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE
  `);

  await q('conversations: adicionar stage', `
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stage text DEFAULT 'bot_triage'
      CHECK (stage IN ('bot_triage', 'awaiting_human', 'in_service', 'resolved'))
  `);

  await q('conversations: adicionar assigned_operator_id', `
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_operator_id uuid REFERENCES panel_users(id) ON DELETE SET NULL
  `);

  await q('conversations: adicionar resolved_at', `
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at timestamptz
  `);

  await q('conversations: adicionar summary', `
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary text
  `);

  await q('conversations: índice client_id', `
    CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id)
  `);

  await q('conversations: índice client+stage', `
    CREATE INDEX IF NOT EXISTS idx_conversations_client_stage ON conversations(client_id, stage)
  `);

  // --- 5. messages ---
  await q('messages: chatwoot_message_id nullable', `
    ALTER TABLE messages ALTER COLUMN chatwoot_message_id DROP NOT NULL
  `);

  await q('messages: adicionar client_id', `
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES panel_clients(id) ON DELETE CASCADE
  `);

  await q('messages: adicionar evolution_message_id', `
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS evolution_message_id text
  `);

  await q('messages: índice client_id', `
    CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id)
  `);

  await q('messages: unique evolution_message_id', `
    CREATE UNIQUE INDEX IF NOT EXISTS messages_evolution_id_unique
      ON messages(evolution_message_id)
      WHERE evolution_message_id IS NOT NULL
  `);

  console.log('\n✅ Migration 010 executada com sucesso!');
})();
