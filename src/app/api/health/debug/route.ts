import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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

  // 1. Get cookies
  const cookiesList: Record<string, string> = {}
  request.cookies.getAll().forEach(c => {
    cookiesList[c.name] = c.value.length > 15 ? `${c.value.slice(0, 8)}...` : c.value
  })

  // 2. Test standard Supabase connection (Service Role)
  let dbStatus = 'Not tested'
  let dbError: string | null = null
  let dbMeta: any = null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey)
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
  }

  // 3. Test Admin Client query on panel_clients (the exact table `/desk` reads)
  let panelClientsStatus = 'Not tested'
  let panelClientsError: string | null = null
  let panelClientsCount = 0

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('panel_clients')
      .select('id, name')
      .eq('status', 'active')
      
    if (error) {
      panelClientsError = error.message
      panelClientsStatus = 'Query failed'
    } else {
      panelClientsStatus = 'Success'
      panelClientsCount = data?.length || 0
    }
  } catch (err: any) {
    panelClientsStatus = 'Exception'
    panelClientsError = err.message || String(err)
  }

  // 4. Test Authenticated Client session resolution
  let authStatus = 'Not tested'
  let authError: string | null = null
  let authUser: any = null

  try {
    const client = await createServerClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error) {
      authStatus = 'Error getting user'
      authError = error.message
    } else if (user) {
      authStatus = 'Authenticated'
      authUser = { id: user.id, email: user.email }
    } else {
      authStatus = 'No session user'
    }
  } catch (err: any) {
    authStatus = 'Exception'
    authError = err.message || String(err)
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: envStatus,
    cookies: cookiesList,
    database: {
      status: dbStatus,
      error: dbError,
      meta: dbMeta
    },
    panelClients: {
      status: panelClientsStatus,
      count: panelClientsCount,
      error: panelClientsError
    },
    auth: {
      status: authStatus,
      user: authUser,
      error: authError
    }
  })
}
