import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const envStatus: Record<string, { defined: boolean; length: number; preview: string }> = {}
  
  const envKeys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL',
    'CHATWOOT_URL',
    'CHATWOOT_API_TOKEN',
    'CHATWOOT_BOT_PASSWORD',
    'EVOLUTION_API_URL',
    'EVOLUTION_API_KEY',
    'OPENAI_API_KEY',
  ]

  for (const key of envKeys) {
    const value = process.env[key]
    if (value) {
      const preview = value.length > 8 
        ? `${value.slice(0, 4)}...${value.slice(-4)}` 
        : '***'
      envStatus[key] = {
        defined: true,
        length: value.length,
        preview,
      }
    } else {
      envStatus[key] = {
        defined: false,
        length: 0,
        preview: 'NOT DEFINED',
      }
    }
  }

  let dbStatus = 'Not tested'
  let dbError: string | null = null
  let dbMeta: any = null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data, error } = await supabase
        .from('_schema_migrations')
        .select('name')
        .limit(1)
        
      if (error) {
        dbStatus = 'Failed'
        dbError = error.message
      } else {
        dbStatus = 'Connected successfully'
        dbMeta = { migrationSample: data?.[0] || null }
      }
    } catch (err: any) {
      dbStatus = 'Exception thrown'
      dbError = err.message || String(err)
    }
  } else {
    dbStatus = 'Skipped - missing Supabase credentials'
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: envStatus,
    database: {
      status: dbStatus,
      error: dbError,
      meta: dbMeta
    }
  })
}
