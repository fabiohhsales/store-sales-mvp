// GET /api/desk/conversations/[id]/events
// Returns paginated conversation events (audit trail).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Validate conversation access
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10),
    200
  )

  const { data: events, error } = await admin
    .from('conversation_events')
    .select('id, event_type, event_source, payload, created_by, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[desk/events] error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  return NextResponse.json({ events: events ?? [] })
}
