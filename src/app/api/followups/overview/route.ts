import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'

type CadenceType = 'lead' | 'atendimento' | 'agendado'

const CADENCE_ORDER: CadenceType[] = ['lead', 'atendimento', 'agendado']

const STEP_ORDER: Record<CadenceType, string[]> = {
  lead: ['lead_D1', 'lead_D2', 'lead_D3', 'lead_D5', 'lead_D7'],
  atendimento: ['atendimento_D1', 'atendimento_D2', 'atendimento_D4', 'atendimento_D7', 'atendimento_D10'],
  agendado: ['agendado_D-2_12h', 'agendado_-3h', 'agendado_-5min'],
}

interface ConversationRow {
  id: string
  followup_cadence: string | null
  last_followup_at: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  status: string | null
  stage: string | null
  contacts: Array<{ name: string | null; phone_number: string | null }> | null
}

interface StepRow {
  conversation_id: string
  cadence_type: CadenceType
  step_key: string
  sent_at: string
}

interface LogRow {
  id: string
  conversation_id: string
  contact_id: string | null
  step_name: string | null
  message_sent: string | null
  sent_at: string
}

function waitingResponse(conversation: ConversationRow): boolean {
  if (!conversation.last_outgoing_at) return false
  if (!conversation.last_incoming_at) return true
  return new Date(conversation.last_outgoing_at).getTime() > new Date(conversation.last_incoming_at).getTime()
}

function getContact(conversation: ConversationRow) {
  return Array.isArray(conversation.contacts) ? conversation.contacts[0] : null
}

function sortLevels(cadence: CadenceType, levels: Array<{ stepKey: string; count: number }>) {
  const order = STEP_ORDER[cadence]
  const rank = new Map(order.map((key, idx) => [key, idx]))
  return levels.sort((a, b) => {
    const ra = rank.has(a.stepKey) ? (rank.get(a.stepKey) as number) : 999
    const rb = rank.has(b.stepKey) ? (rank.get(b.stepKey) as number) : 999
    if (ra !== rb) return ra - rb
    return a.stepKey.localeCompare(b.stepKey)
  })
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()
  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')
    const daysParam = parseInt(request.nextUrl.searchParams.get('days') || '30', 10)
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 7), 90) : 30

    const auth = await authenticateRequest(token, clientId)
    const admin = createAdminClient()

    const { data: conversationsRaw, error: convError } = await admin
      .from('conversations')
      .select(`
        id,
        followup_cadence,
        last_followup_at,
        last_incoming_at,
        last_outgoing_at,
        status,
        stage,
        contacts(name, phone_number)
      `)
      .eq('client_id', auth.client_id)
      .neq('stage', 'resolved')

    if (convError) throw convError

    const conversations = (conversationsRaw ?? []) as ConversationRow[]
    const conversationIds = conversations.map((c) => c.id)

    if (!conversationIds.length) {
      return NextResponse.json(
        {
          summary: {
            activeFlows: 0,
            sentStepsInWindow: 0,
            waitingResponseConversations: 0,
            waitingResponseAttempts: 0,
            windowDays: days,
          },
          flows: CADENCE_ORDER.map((cadence) => ({
            cadence,
            inFlow: 0,
            sentStepsInWindow: 0,
            waitingResponse: 0,
            maxAttemptsWithoutResponse: 0,
            levels: [],
          })),
          recent: [],
        },
        { headers: { 'x-request-id': requestId } }
      )
    }

    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: stepsRaw, error: stepsError }, { data: logsRaw, error: logsError }] = await Promise.all([
      admin
        .from('followup_cadence_steps')
        .select('conversation_id, cadence_type, step_key, sent_at')
        .in('conversation_id', conversationIds)
        .gte('sent_at', windowStart),
      admin
        .from('followup_logs')
        .select('id, conversation_id, contact_id, step_name, message_sent, sent_at')
        .in('conversation_id', conversationIds)
        .gte('sent_at', windowStart)
        .order('sent_at', { ascending: false })
        .limit(120),
    ])

    if (stepsError) throw stepsError
    if (logsError) throw logsError

    const steps = (stepsRaw ?? []) as StepRow[]
    const logs = (logsRaw ?? []) as LogRow[]

    const conversationById = new Map(conversations.map((c) => [c.id, c]))
    const attemptsByConversation = new Map<string, number>()
    const attemptsByConversationAndCadence = new Map<string, number>()

    for (const step of steps) {
      attemptsByConversation.set(step.conversation_id, (attemptsByConversation.get(step.conversation_id) ?? 0) + 1)
      const key = `${step.conversation_id}::${step.cadence_type}`
      attemptsByConversationAndCadence.set(key, (attemptsByConversationAndCadence.get(key) ?? 0) + 1)
    }

    const waitingResponseConversations = conversations.filter(waitingResponse)
    const waitingResponseAttempts = waitingResponseConversations.reduce(
      (sum, c) => sum + (attemptsByConversation.get(c.id) ?? 0),
      0
    )

    const flowAccumulator: Record<CadenceType, {
      inFlow: number
      sentStepsInWindow: number
      waitingResponse: number
      maxAttemptsWithoutResponse: number
      levelsCount: Map<string, number>
    }> = {
      lead: { inFlow: 0, sentStepsInWindow: 0, waitingResponse: 0, maxAttemptsWithoutResponse: 0, levelsCount: new Map() },
      atendimento: { inFlow: 0, sentStepsInWindow: 0, waitingResponse: 0, maxAttemptsWithoutResponse: 0, levelsCount: new Map() },
      agendado: { inFlow: 0, sentStepsInWindow: 0, waitingResponse: 0, maxAttemptsWithoutResponse: 0, levelsCount: new Map() },
    }

    for (const conv of conversations) {
      const cadence = conv.followup_cadence as CadenceType | null
      if (!cadence || !(cadence in flowAccumulator)) continue
      flowAccumulator[cadence].inFlow += 1

      if (waitingResponse(conv)) {
        flowAccumulator[cadence].waitingResponse += 1
        const attempts = attemptsByConversationAndCadence.get(`${conv.id}::${cadence}`) ?? 0
        if (attempts > flowAccumulator[cadence].maxAttemptsWithoutResponse) {
          flowAccumulator[cadence].maxAttemptsWithoutResponse = attempts
        }
      }
    }

    for (const step of steps) {
      const cadence = step.cadence_type
      if (!(cadence in flowAccumulator)) continue
      flowAccumulator[cadence].sentStepsInWindow += 1
      flowAccumulator[cadence].levelsCount.set(step.step_key, (flowAccumulator[cadence].levelsCount.get(step.step_key) ?? 0) + 1)
    }

    const flows = CADENCE_ORDER.map((cadence) => {
      const row = flowAccumulator[cadence]
      const levels = sortLevels(
        cadence,
        Array.from(row.levelsCount.entries()).map(([stepKey, count]) => ({ stepKey, count }))
      )

      return {
        cadence,
        inFlow: row.inFlow,
        sentStepsInWindow: row.sentStepsInWindow,
        waitingResponse: row.waitingResponse,
        maxAttemptsWithoutResponse: row.maxAttemptsWithoutResponse,
        levels,
      }
    })

    const recent = logs.map((entry) => {
      const conv = conversationById.get(entry.conversation_id)
      const cadence = (conv?.followup_cadence as CadenceType | null) ?? null
      const contact = conv ? getContact(conv) : null
      return {
        id: entry.id,
        sent_at: entry.sent_at,
        cadence,
        step_key: entry.step_name,
        contact_name: contact?.name ?? 'Sem nome',
        contact_phone: contact?.phone_number ?? null,
        message_preview: entry.message_sent ? entry.message_sent.slice(0, 180) : null,
        waiting_response: conv ? waitingResponse(conv) : false,
        attempts_without_response: conv ? (attemptsByConversation.get(conv.id) ?? 0) : 0,
      }
    })

    return NextResponse.json(
      {
        summary: {
          activeFlows: conversations.filter((c) => !!c.followup_cadence).length,
          sentStepsInWindow: steps.length,
          waitingResponseConversations: waitingResponseConversations.length,
          waitingResponseAttempts,
          windowDays: days,
        },
        flows,
        recent,
      },
      { headers: { 'x-request-id': requestId } }
    )
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message, errorId: requestId }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    console.error('[followups/overview] Error', { requestId, message, status })
    return NextResponse.json({ error: message, errorId: requestId }, { status })
  }
}
