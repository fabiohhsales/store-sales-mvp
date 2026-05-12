import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import {
  getSuppressedConversations,
  resolveAgendadoSteps,
  resolveAtendimentoSteps,
  resolveLeadSteps,
} from '@/lib/followup/shared'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CadenceType,
  FollowupConversation,
  FollowupConversationsResponse,
  FollowupStatusFilter,
  FollowupTreeNode,
} from '@/types/followup'
import type { PanelBotConfig } from '@/types/database'

type ConversationRow = {
  id: string
  client_id: string
  contact_id: string | null
  followup_cadence: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  stage: string | null
  status: string | null
  contacts: Array<{ name: string | null; phone_number: string | null }> | null
}

type StepRow = {
  conversation_id: string
  cadence_type: CadenceType
  step_key: string
  sent_at: string
  message_sent: string | null
}

const CADENCE_META: Record<CadenceType, { label: string }> = {
  lead: { label: 'Lead' },
  atendimento: { label: 'Atendimento' },
  agendado: { label: 'Agendado' },
}

function isCadenceType(value: string | null): value is CadenceType {
  return value === 'lead' || value === 'atendimento' || value === 'agendado'
}

function isStatusFilter(value: string | null): value is FollowupStatusFilter {
  return value === 'all' || value === 'waiting_response' || value === 'responded'
}

function waitingResponse(conversation: Pick<ConversationRow, 'last_incoming_at' | 'last_outgoing_at'>): boolean {
  if (!conversation.last_outgoing_at) return false
  if (!conversation.last_incoming_at) return true
  return new Date(conversation.last_outgoing_at).getTime() > new Date(conversation.last_incoming_at).getTime()
}

function getContact(conversation: ConversationRow) {
  return Array.isArray(conversation.contacts) ? conversation.contacts[0] ?? null : null
}

function buildDefinitions(config: PanelBotConfig | null) {
  const fallbackConfig = (config ?? {}) as PanelBotConfig
  return [
    {
      cadence: 'lead' as const,
      steps: resolveLeadSteps(fallbackConfig).map((step) => ({ step_key: step.step_key, label: step.label })),
    },
    {
      cadence: 'atendimento' as const,
      steps: resolveAtendimentoSteps(fallbackConfig).map((step) => ({ step_key: step.step_key, label: step.label })),
    },
    {
      cadence: 'agendado' as const,
      steps: resolveAgendadoSteps(fallbackConfig).map((step) => ({ step_key: step.step_key, label: step.label })),
    },
  ]
}

function buildStepLabelMap(config: PanelBotConfig | null): Map<string, string> {
  const map = new Map<string, string>()
  for (const definition of buildDefinitions(config)) {
    for (const step of definition.steps) {
      map.set(step.step_key, step.label)
    }
  }
  return map
}

function buildTree(
  config: PanelBotConfig | null,
  conversations: FollowupConversation[]
): FollowupTreeNode[] {
  const definitions = buildDefinitions(config)
  return definitions.map(({ cadence, steps }) => {
    const cadenceConversations = conversations.filter((conversation) => conversation.cadence_type === cadence)
    const stepCounts = new Map<string, number>()

    for (const conversation of cadenceConversations) {
      stepCounts.set(
        conversation.current_step,
        (stepCounts.get(conversation.current_step) ?? 0) + 1
      )
    }

    return {
      cadence,
      label: CADENCE_META[cadence].label,
      count: cadenceConversations.length,
      steps: steps.map((step) => ({
        step_key: step.step_key,
        label: step.label,
        count: stepCounts.get(step.step_key) ?? 0,
      })),
    }
  })
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')
    const cadenceFilter = request.nextUrl.searchParams.get('cadence')
    const stepFilter = request.nextUrl.searchParams.get('step')
    const statusParam = request.nextUrl.searchParams.get('status')
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10))
    const perPage = Math.max(1, Math.min(100, parseInt(request.nextUrl.searchParams.get('per_page') || '20', 10)))
    const statusFilter: FollowupStatusFilter = isStatusFilter(statusParam) ? statusParam : 'all'

    const auth = await authenticateRequest(token, clientId)
    const admin = createAdminClient()

    const [{ data: configRaw, error: configError }, { data: conversationsRaw, error: conversationsError }] =
      await Promise.all([
        admin.from('panel_bot_config').select('*').eq('client_id', auth.client_id).maybeSingle(),
        admin
          .from('conversations')
          .select(`
            id,
            client_id,
            contact_id,
            followup_cadence,
            last_incoming_at,
            last_outgoing_at,
            stage,
            status,
            contacts(name, phone_number)
          `)
          .eq('client_id', auth.client_id)
          .or('stage.neq.resolved,stage.is.null')
          .not('followup_cadence', 'is', null)
          .limit(500),
      ])

    if (configError) throw configError
    if (conversationsError) throw conversationsError

    const config = (configRaw ?? null) as PanelBotConfig | null
    const stepLabels = buildStepLabelMap(config)
    const conversationRows = (conversationsRaw ?? []) as ConversationRow[]
    const conversationIds = conversationRows.map((conversation) => conversation.id)

    if (!conversationIds.length) {
      const response: FollowupConversationsResponse = {
        summary: {
          totalActive: 0,
          filteredTotal: 0,
          waitingResponse: 0,
          responded: 0,
        },
        tree: buildTree(config, []),
        conversations: [],
        pagination: {
          page,
          perPage,
          total: 0,
          totalPages: 0,
        },
      }
      return NextResponse.json(response, { headers: { 'x-request-id': requestId } })
    }

    const [{ data: stepsRaw, error: stepsError }, suppressedLead, suppressedAtendimento, suppressedAgendado] =
      await Promise.all([
        admin
          .from('followup_cadence_steps')
          .select('conversation_id, cadence_type, step_key, sent_at, message_sent')
          .in('conversation_id', conversationIds)
          .order('sent_at', { ascending: false })
          .limit(4000),
        getSuppressedConversations(auth.client_id, 'lead'),
        getSuppressedConversations(auth.client_id, 'atendimento'),
        getSuppressedConversations(auth.client_id, 'agendado'),
      ])

    if (stepsError) throw stepsError

    const steps = (stepsRaw ?? []) as StepRow[]
    const stepGroups = new Map<string, StepRow[]>()

    for (const step of steps) {
      const key = `${step.conversation_id}::${step.cadence_type}`
      const current = stepGroups.get(key) ?? []
      current.push(step)
      stepGroups.set(key, current)
    }

    const activeConversations: FollowupConversation[] = []

    for (const conversation of conversationRows) {
      if (!isCadenceType(conversation.followup_cadence)) continue

      if (conversation.followup_cadence === 'lead' && suppressedLead.has(conversation.id)) continue
      if (conversation.followup_cadence === 'atendimento' && suppressedAtendimento.has(conversation.id)) continue
      if (conversation.followup_cadence === 'agendado' && suppressedAgendado.has(conversation.id)) continue

      const groupedSteps = stepGroups.get(`${conversation.id}::${conversation.followup_cadence}`) ?? []
      const latestStep = groupedSteps[0] ?? null
      const contact = getContact(conversation)
      const currentStepLabel = latestStep
        ? (stepLabels.get(latestStep.step_key) ?? latestStep.step_key)
        : 'Aguardando 1º envio'

      activeConversations.push({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        client_id: conversation.client_id,
        contact_name: contact?.name ?? 'Sem nome',
        contact_phone: contact?.phone_number ?? '',
        cadence_type: conversation.followup_cadence,
        current_step: latestStep?.step_key ?? 'pending',
        current_step_label: currentStepLabel,
        step_sent_at: latestStep?.sent_at ?? null,
        total_attempts: groupedSteps.length,
        waiting_response: waitingResponse(conversation),
        last_incoming_at: conversation.last_incoming_at,
        last_outgoing_at: conversation.last_outgoing_at,
        last_message_preview: latestStep?.message_sent?.slice(0, 180) ?? null,
        stage: conversation.stage,
      })
    }

    const statusScopedConversations =
      statusFilter === 'waiting_response'
        ? activeConversations.filter((conversation) => conversation.waiting_response)
        : statusFilter === 'responded'
          ? activeConversations.filter((conversation) => !conversation.waiting_response)
          : activeConversations

    const tree = buildTree(config, activeConversations)

    const filteredConversations = statusScopedConversations
      .filter((conversation) => !isCadenceType(cadenceFilter) || conversation.cadence_type === cadenceFilter)
      .filter((conversation) => !stepFilter || conversation.current_step === stepFilter)
      .sort((left, right) => {
        const lTime = left.step_sent_at ? new Date(left.step_sent_at).getTime() : 0
        const rTime = right.step_sent_at ? new Date(right.step_sent_at).getTime() : 0
        return rTime - lTime
      })

    const total = filteredConversations.length
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage)
    const start = (page - 1) * perPage
    const paginatedConversations = filteredConversations.slice(start, start + perPage)

    const response: FollowupConversationsResponse = {
      summary: {
        totalActive: activeConversations.length,
        filteredTotal: total,
        waitingResponse: statusScopedConversations.filter((conversation) => conversation.waiting_response).length,
        responded: statusScopedConversations.filter((conversation) => !conversation.waiting_response).length,
      },
      tree,
      conversations: paginatedConversations,
      pagination: {
        page,
        perPage,
        total,
        totalPages,
      },
    }

    return NextResponse.json(response, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message, errorId: requestId }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Erro interno'
    console.error('[followups/conversations] Error', { requestId, message })
    return NextResponse.json({ error: message, errorId: requestId }, { status: 500 })
  }
}
