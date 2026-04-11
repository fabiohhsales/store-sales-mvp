import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBotConfigByClientId } from '@/lib/db/bot-config'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'
import type { PipelineBoardConversation } from '@/types/pipeline'

interface ConversationRow {
  id: string
  chatwoot_conversation_id: number | null
  status: 'pending' | 'open' | 'resolved' | null
  stage: string | null
  labels: string[] | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  followup_cadence: string | null
  appointment_status: string | null
  summary: string | null
  contacts: Array<{
    name: string | null
    phone_number: string | null
    identifier: string | null
  }> | {
    name: string | null
    phone_number: string | null
    identifier: string | null
  } | null
}

interface AppointmentRow {
  id: string
  conversation_id: string
  start_at: string
  end_at: string
  status: string | null
  meet_link: string | null
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
    const clientId = request.nextUrl.searchParams.get('client_id')
    const statusFilter = request.nextUrl.searchParams.get('status')

    const auth = await authenticateRequest(token, clientId)
    const admin = createAdminClient()

    // Busca stage_labels do bot config
    const botConfig = await getBotConfigByClientId(auth.client_id)
    const stageLabels = sanitizeStageLabels(botConfig?.stage_labels)
    const stageSlugs = new Set(stageLabels.map((s) => s.slug))

    const conversationSelect = `
      id,
      chatwoot_conversation_id,
      status,
      stage,
      labels,
      last_incoming_at,
      last_outgoing_at,
      followup_cadence,
      appointment_status,
      summary,
      contacts(name, phone_number, identifier)
    `

    let query = admin
      .from('conversations')
      .select(conversationSelect)
      .eq('client_id', auth.client_id)

    if (statusFilter === 'resolved') {
      query = query.eq('stage', 'resolved')
    } else {
      query = query.or('stage.neq.resolved,stage.is.null')
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
    }

    const { data: conversations, error: convError } = await query
      .order('last_incoming_at', { ascending: false, nullsFirst: false })

    if (convError) throw convError

    const typedConversations = (conversations ?? []) as ConversationRow[]
    const conversationIds = typedConversations.map((conversation) => conversation.id)
    const appointmentsMap: Record<string, AppointmentRow> = {}

    if (conversationIds.length > 0) {
      const { data: appointments } = await admin
        .from('appointments')
        .select('id, conversation_id, start_at, end_at, status, meet_link')
        .in('conversation_id', conversationIds)
        .order('start_at', { ascending: false })

      for (const appointment of (appointments ?? []) as AppointmentRow[]) {
        if (!appointmentsMap[appointment.conversation_id]) {
          appointmentsMap[appointment.conversation_id] = appointment
        }
      }
    }

    const pipelineConversations: PipelineBoardConversation[] = typedConversations.map((conversation) => {
      const labels = conversation.labels ?? []
      const contact = Array.isArray(conversation.contacts)
        ? conversation.contacts[0] ?? null
        : conversation.contacts ?? null

      // Posição no funil é determinada apenas por labels[].
      // conversations.stage permanece reservado ao estado operacional do Desk.
      const funnelLabel = labels.find((label) => stageSlugs.has(label))
      const appointment = appointmentsMap[conversation.id] ?? null
      const lastIncomingAt = conversation.last_incoming_at

      return {
        id: conversation.id,
        chatwoot_conversation_id: conversation.chatwoot_conversation_id ?? null,
        contact_name: contact?.name ?? null,
        contact_phone: contact?.phone_number ?? null,
        contact_identifier: contact?.identifier ?? null,
        status: conversation.status ?? 'open',
        stage_slug: funnelLabel ?? '_sem_etapa',
        labels,
        last_incoming_at: lastIncomingAt,
        last_outgoing_at: conversation.last_outgoing_at ?? null,
        stage_entered_at: null,
        followup_cadence: conversation.followup_cadence ?? null,
        summary: conversation.summary ?? null,
        intake_fields_filled: 0,
        intake_fields_total: 0,
        temperature: classifyPipelineTemperature(lastIncomingAt),
        appointment_status: conversation.appointment_status ?? null,
        appointment: appointment
          ? {
              id: appointment.id,
              start_at: appointment.start_at,
              end_at: appointment.end_at,
              status: appointment.status ?? null,
              meet_link: appointment.meet_link ?? null,
            }
          : null,
      }
    })

    const columns = [
      { slug: '_sem_etapa', display_name: 'Sem etapa', followup_cadence: null },
      ...stageLabels,
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
