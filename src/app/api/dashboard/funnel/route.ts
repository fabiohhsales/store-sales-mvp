// GET /api/dashboard/funnel?client_id=
// Métricas consolidadas de funil para o OperatorDashboard.
//
// Retorna (janela fixa de 7 dias para followups e resolvidas):
//   stageCounts   — conversas ativas por stage + resolvidas nos últimos 7 dias
//   temperatureCounts — distribuição de temperatura por dias sem resposta do paciente
//   followupSentWeek  — follow-ups enviados por tipo de cadência nos últimos 7 dias
//   agendaWeek        — agendamentos nos próximos 7 dias por status
//
// Modelo de temperatura (last_incoming_at das conversas ativas):
//   hot    = < 1 dia
//   warm   = 1–3 dias
//   cold   = 3–7 dias
//   frozen = 7+ dias ou sem mensagem recebida

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { getBotConfigByClientId } from '@/lib/db/bot-config'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'
import { normalizeAgendaStatus } from '@/lib/agenda/constants'

type StageCounts = { bot_triage: number; awaiting_human: number; in_service: number; resolved_week: number }
type TemperatureCounts = { hot: number; warm: number; cold: number; frozen: number }
type FollowupSentWeek = { lead: number; atendimento: number; agendado: number }
type AgendaWeek = { total: number; confirmed: number; scheduled: number; noshow: number }

interface FunnelResponse {
  stageCounts: StageCounts
  temperatureCounts: TemperatureCounts
  followupSentWeek: FollowupSentWeek
  agendaWeek: AgendaWeek
  funnelCounts: Record<string, number>
  funnelLabels: ReturnType<typeof sanitizeStageLabels>
  operational: {
    stageCounts: StageCounts
    temperatureCounts: TemperatureCounts
  }
  commercial: {
    funnelCounts: Record<string, number>
    funnelLabels: ReturnType<typeof sanitizeStageLabels>
    source: 'labels[]'
  }
  followup: {
    sentWeek: FollowupSentWeek
  }
  agenda: {
    week: AgendaWeek
  }
}

function classifyTemperature(lastIncomingAt: string | null): 'hot' | 'warm' | 'cold' | 'frozen' {
  if (!lastIncomingAt) return 'frozen'
  const diffDays = (Date.now() - new Date(lastIncomingAt).getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 1) return 'hot'
  if (diffDays < 3) return 'warm'
  if (diffDays < 7) return 'cold'
  return 'frozen'
}

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'client_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Batch 1: todas as conversas do cliente (evita múltiplas queries à mesma tabela)
  const { data: convRows } = await admin
    .from('conversations')
    .select('id, stage, labels, last_incoming_at, resolved_at')
    .eq('client_id', deskUser.clientId)

  const conversations = convRows ?? []
  const conversationIds = conversations.map((c) => c.id)

  // Busca stage_labels configurados para contagem por funil
  const botConfig = await getBotConfigByClientId(deskUser.clientId)
  const stageLabels = sanitizeStageLabels(botConfig?.stage_labels)
  const stageSlugs = new Set(stageLabels.map((s) => s.slug))

  // Batch 2: followup steps dos últimos 7 dias + agenda próximos 7 dias (em paralelo)
  const [{ data: followupRows }, { data: agendaRows }] = await Promise.all([
    conversationIds.length > 0
      ? admin
          .from('followup_cadence_steps')
          .select('cadence_type')
          .in('conversation_id', conversationIds)
          .gte('sent_at', sevenDaysAgo)
      : Promise.resolve({ data: [] as Array<{ cadence_type: string }> }),
    admin
      .from('appointments')
      .select('status, conversations!inner(client_id)')
      .eq('conversations.client_id', deskUser.clientId)
      .gte('start_at', now.toISOString())
      .lte('start_at', sevenDaysAhead),
  ])

  // --- Stage counts (operacional) + Temperatura + Funil (labels) ---
  const stageCounts = { bot_triage: 0, awaiting_human: 0, in_service: 0, resolved_week: 0 }
  const temperatureCounts = { hot: 0, warm: 0, cold: 0, frozen: 0 }
  const funnelCounts: Record<string, number> = {}
  for (const sl of stageLabels) funnelCounts[sl.slug] = 0
  funnelCounts['_sem_etapa'] = 0

  for (const conv of conversations) {
    if (conv.stage === 'resolved') {
      if (conv.resolved_at && conv.resolved_at >= sevenDaysAgo) {
        stageCounts.resolved_week++
      }
    } else {
      // Conta stage operacional (pode ser null para conversas ativas legadas)
      if (conv.stage != null && conv.stage in stageCounts) {
        stageCounts[conv.stage as keyof typeof stageCounts]++
      }
      // Temperatura: conta toda conversa não-resolvida (inclusive stage null)
      temperatureCounts[classifyTemperature(conv.last_incoming_at)]++

      // Funil via labels
      const labels = (conv.labels as string[]) || []
      const funnelLabel = labels.find((l) => stageSlugs.has(l))
      if (funnelLabel) {
        funnelCounts[funnelLabel]++
      } else {
        funnelCounts['_sem_etapa']++
      }
    }
  }

  // --- Follow-up counts por cadência ---
  const followupSentWeek = { lead: 0, atendimento: 0, agendado: 0 }
  for (const step of followupRows ?? []) {
    const t = step.cadence_type as keyof typeof followupSentWeek
    if (t in followupSentWeek) followupSentWeek[t]++
  }

  // --- Agenda próximos 7 dias ---
  const agendaWeek = { total: 0, confirmed: 0, scheduled: 0, noshow: 0 }
  for (const apt of agendaRows ?? []) {
    agendaWeek.total++
    const s = normalizeAgendaStatus((apt.status as string | null) ?? null)
    if (s === 'confirmed') agendaWeek.confirmed++
    else if (s === 'scheduled') agendaWeek.scheduled++
    else if (s === 'noshow') agendaWeek.noshow++
  }

  const response: FunnelResponse = {
    stageCounts,
    temperatureCounts,
    followupSentWeek,
    agendaWeek,
    funnelCounts,
    funnelLabels: stageLabels,
    operational: {
      stageCounts,
      temperatureCounts,
    },
    commercial: {
      funnelCounts,
      funnelLabels: stageLabels,
      source: 'labels[]',
    },
    followup: {
      sentWeek: followupSentWeek,
    },
    agenda: {
      week: agendaWeek,
    },
  }

  return NextResponse.json(response)
}
