import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

const RETAIL_STAGES = [
  'new_lead',
  'product_discovery',
  'product_recommended',
  'offer_formatting',
  'price_requested',
  'quote_requested',
  'payment_link_sent',
  'negotiation',
  'won',
  'lost',
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      client_id,
      conversation_id,
      from_stage,
      to_stage,
      token,
      lost_reason,
    } = body

    if (!from_stage || !to_stage) {
      return NextResponse.json(
        { error: 'from_stage e to_stage são obrigatórios' },
        { status: 400 }
      )
    }

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id é obrigatório' },
        { status: 400 }
      )
    }

    if (!RETAIL_STAGES.includes(to_stage)) {
      return NextResponse.json(
        { error: `to_stage inválida: ${to_stage}` },
        { status: 400 }
      )
    }

    if (to_stage === 'lost' && !lost_reason) {
      return NextResponse.json(
        { error: 'Motivo da perda (lost_reason) é obrigatório ao mover para lost' },
        { status: 400 }
      )
    }

    let accountId: string | null = null
    let operatorUserId: string | null = null

    if (token || client_id) {
      const auth = await authenticateRequest(token || null, client_id || null)
      accountId = auth.client_id
    } else {
      const session = await getStoreSession()
      if (session) {
        accountId = session.accountId
        operatorUserId = session.user.id
      }
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Não autorizado ou conta não identificada' }, { status: 401 })
    }

    const admin = createAdminClient()

    // 1. Fetch conversation
    const { data: conversation, error: fetchError } = await admin
      .from('store_conversations')
      .select('id, commercial_stage')
      .eq('id', conversation_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // 2. Update commercial stage
    const updates: any = {
      commercial_stage: to_stage,
      updated_at: new Date().toISOString(),
    }

    if (to_stage === 'won') {
      updates.won_at = new Date().toISOString()
      updates.operational_status = 'resolved'
      if (operatorUserId) {
        updates.assigned_user_id = operatorUserId
      }
    } else if (to_stage === 'lost') {
      updates.operational_status = 'resolved'
      updates.lost_reason = lost_reason
      if (operatorUserId) {
        updates.assigned_user_id = operatorUserId
      }
    } else if (conversation.commercial_stage === 'won' || conversation.commercial_stage === 'lost') {
      // Re-opening from won/lost back to active conversation
      updates.operational_status = 'bot_active'
    }

    const { error: updateError } = await admin
      .from('store_conversations')
      .update(updates)
      .eq('id', conversation.id)

    if (updateError) {
      console.error('[pipeline/move] Falha ao atualizar etapa:', {
        conversationId: conversation.id,
        from_stage,
        to_stage,
        error: updateError,
      })
      throw updateError
    }

    console.log('[pipeline/move] Etapa movida com sucesso:', {
      conversationId: conversation.id,
      from_stage,
      to_stage,
      accountId,
    })

    return NextResponse.json({ success: true, commercial_stage: to_stage })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
