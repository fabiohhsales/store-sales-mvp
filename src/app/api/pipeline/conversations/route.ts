import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'
import type { PipelineBoardConversation } from '@/types/pipeline'

interface StoreConversationRow {
  id: string
  operational_status: string | null
  commercial_stage: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  summary: string | null
  contact: {
    name: string | null
    phone_number: string | null
  } | null
}

function classifyPipelineTemperature(lastIncomingAt: string | null): 'hot' | 'warm' | 'cold' {
  if (!lastIncomingAt) return 'cold'
  const diffDays = (Date.now() - new Date(lastIncomingAt).getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 1) return 'hot'
  if (diffDays < 3) return 'warm'
  return 'cold'
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientIdParam = request.nextUrl.searchParams.get('client_id')
    const statusFilter = request.nextUrl.searchParams.get('status')

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
      return NextResponse.json({ error: 'Não autorizado ou nenhuma conta associada.' }, { status: 401 })
    }

    const admin = createAdminClient()

    const conversationSelect = `
      id,
      operational_status,
      commercial_stage,
      summary,
      last_incoming_at,
      last_outgoing_at,
      contact:store_contacts(name, phone_number)
    `

    let query = admin
      .from('store_conversations')
      .select(conversationSelect)
      .eq('account_id', accountId)

    if (statusFilter === 'resolved') {
      query = query.eq('commercial_stage', 'won')
    } else if (statusFilter === 'all') {
      // Retorna todos os que não são ganhas/perdidas de preferência, ou todos mesmo
    } else if (statusFilter) {
      // Mapeia status operacional
      query = query.eq('operational_status', statusFilter)
    }

    const { data: conversations, error: convError } = await query
      .order('last_incoming_at', { ascending: false, nullsFirst: false })

    if (convError) throw convError

    const typedConversations = (conversations ?? []) as unknown as StoreConversationRow[]

    const pipelineConversations: PipelineBoardConversation[] = typedConversations.map((conv) => {
      const contactName = conv.contact?.name || 'Cliente Sem Nome'
      const contactPhone = conv.contact?.phone_number || ''
      const lastIncomingAt = conv.last_incoming_at

      const stageSlug = conv.commercial_stage || 'new_lead'

      return {
        id: conv.id,
        chatwoot_conversation_id: null,
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_identifier: contactPhone,
        status: conv.operational_status === 'resolved' ? 'resolved' : 'open',
        stage_slug: stageSlug,
        labels: [stageSlug],
        last_incoming_at: lastIncomingAt,
        last_outgoing_at: conv.last_outgoing_at ?? null,
        stage_entered_at: null,
        followup_cadence: null,
        summary: conv.summary ?? null,
        intake_fields_filled: 0,
        intake_fields_total: 0,
        temperature: classifyPipelineTemperature(lastIncomingAt),
        appointment_status: null,
        appointment: null,
      }
    })

    // Colunas fixas do Kanban comercial de loja
    const columns = [
      { slug: 'new_lead', display_name: 'Novo Lead', followup_cadence: null },
      { slug: 'product_discovery', display_name: 'Descoberta', followup_cadence: null },
      { slug: 'product_recommended', display_name: 'Recomendação', followup_cadence: null },
      { slug: 'offer_formatting', display_name: 'Formatação de Oferta', followup_cadence: null },
      { slug: 'price_requested', display_name: 'Preço Solicitado', followup_cadence: null },
      { slug: 'quote_requested', display_name: 'Orçamento', followup_cadence: null },
      { slug: 'payment_link_sent', display_name: 'Link Enviado', followup_cadence: null },
      { slug: 'negotiation', display_name: 'Negociação', followup_cadence: null },
      { slug: 'won', display_name: 'Ganha', followup_cadence: null },
      { slug: 'lost', display_name: 'Perdida', followup_cadence: null },
    ]

    return NextResponse.json({
      columns,
      conversations: pipelineConversations,
      chatwootAccountId: null,
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
