// GET /api/desk/conversations/[id]/context
// Returns consolidated ConversationContext view-model for the Desk sidebar.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { getConversationContext } from '@/lib/desk/get-conversation-context'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Validate conversation access
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const context = await getConversationContext(id, conv.client_id)
  if (!context) return NextResponse.json({ error: 'Contexto não encontrado' }, { status: 404 })

  return NextResponse.json(context)
}
