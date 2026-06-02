import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientIdParam = request.nextUrl.searchParams.get('client_id')
    const conversationId = request.nextUrl.searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id é obrigatório' }, { status: 400 })
    }

    let accountId: string | null = null

    if (token || clientIdParam) {
      const auth = await authenticateRequest(token, clientIdParam)
      accountId = auth.client_id
    } else {
      const session = await getStoreSession()
      if (session) {
        accountId = session.accountId
      }
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Não autorizado ou conta não identificada' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Valida conversa e se ela pertence a conta
    const { data: conversation, error: convError } = await admin
      .from('store_conversations')
      .select('id, account_id')
      .eq('id', conversationId)
      .maybeSingle()

    if (convError) throw convError
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }
    if (conversation.account_id !== accountId) {
      return NextResponse.json({ error: 'Acesso negado para esta conversa' }, { status: 403 })
    }

    // Busca mensagens da nova tabela store_messages
    const { data, error } = await admin
      .from('store_messages')
      .select('id, content, from_who, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    // Retorna em ordem cronológica (mais antiga primeiro)
    return NextResponse.json((data || []).reverse())
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
