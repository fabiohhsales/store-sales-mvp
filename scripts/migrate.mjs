// Runner de migrations automático — executa antes do `next start`.
// Aplica apenas as migrations ainda não registradas em _schema_migrations.
// Falha com exit 1 se uma migration der erro (impede o app de subir com banco inconsistente).

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[migrate] NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos')
  process.exit(1)
}

async function sql(query) {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json()
}

async function migrate() {
  // Tabela de controle — cria se não existir
  await sql(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name       text        PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `)

  const applied = await sql('SELECT name FROM _schema_migrations ORDER BY name')
  const done = new Set(applied.map((r) => r.name))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pending = files.filter((f) => !done.has(f))

  if (pending.length === 0) {
    console.log('[migrate] Banco em dia — nenhuma migration pendente.')
    return
  }

  console.log(`[migrate] ${pending.length} migration(s) pendente(s): ${pending.join(', ')}`)

  for (const file of pending) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
    console.log(`[migrate] Aplicando ${file}...`)
    try {
      await sql(content)
      await sql(`INSERT INTO _schema_migrations (name) VALUES ('${file.replace(/'/g, "''")}')`)
      console.log(`[migrate] ✓ ${file}`)
    } catch (err) {
      console.error(`[migrate] ERRO em ${file}: ${err.message}`)
      console.error('[migrate] Deploy abortado — banco inconsistente.')
      process.exit(1)
    }
  }

  console.log('[migrate] Todas as migrations aplicadas com sucesso.')
}

migrate().catch((err) => {
  console.error('[migrate] Fatal:', err.message)
  process.exit(1)
})
