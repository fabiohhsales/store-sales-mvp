import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, resolveSessionRoleContext } from '@/lib/auth/request-context'
import { createClient } from '@/lib/supabase/server'

function getSince(period: string): string | null {
  const ms: Record<string, number> = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }
  if (!ms[period]) return null
  return new Date(Date.now() - ms[period]).toISOString()
}

export async function GET(req: NextRequest) {
  try {
    const context = await resolveSessionRoleContext()
    if (context.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') ?? '30d'
    const clientId = searchParams.get('client_id') ?? ''
    const action = searchParams.get('action') ?? ''
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

    const supabase = await createClient()
    const since = getSince(period)

    let query = supabase
      .from('panel_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (since) query = query.gte('created_at', since)
    if (clientId) query = query.eq('client_id', clientId)
    if (action) query = query.ilike('action', `%${action}%`)

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ logs: data ?? [], total: count ?? 0 })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
