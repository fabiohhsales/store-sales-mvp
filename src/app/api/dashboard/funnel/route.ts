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
    .select('id, stage, last_incoming_at, resolved_at')
    .eq('client_id', deskUser.clientId)

  const conversations = convRows ?? []
  const conversationIds = conversations.map((c) => c.id)

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

  // --- Stage counts + Temperatura ---
  const stageCounts = { bot_triage: 0, awaiting_human: 0, in_service: 0, resolved_week: 0 }
  const temperatureCounts = { hot: 0, warm: 0, cold: 0, frozen: 0 }

  for (const conv of conversations) {
    if (conv.stage === 'resolved') {
      if (conv.resolved_at && conv.resolved_at >= sevenDaysAgo) {
        stageCounts.resolved_week++
      }
    } else if (conv.stage != null) {
      if (conv.stage in stageCounts) {
        stageCounts[conv.stage as keyof typeof stageCounts]++
      }
      temperatureCounts[classifyTemperature(conv.last_incoming_at)]++
    }
  }

  // --- Follow-up counts por cadência ---
  const followupSentWeek = { lead: 0, atendimento: 0, agendado: 0 }
  for (const step of followupRows ?? []) {
    const t = step.cadence_type as keyof typeof followupSentWeek
    if (t in followupSentWeek) followupSentWeek[t]++
  }

  // --- Agenda próximos 7 dias ---
  const agendaWeek = { total: 0, confirmed: 0, scheduled: 0, no_show: 0 }
  for (const apt of agendaRows ?? []) {
    agendaWeek.total++
    const s = (apt.status as string | null) ?? ''
    if (s === 'confirmed') agendaWeek.confirmed++
    else if (s === 'scheduled') agendaWeek.scheduled++
    else if (s === 'no_show' || s === 'noshow') agendaWeek.no_show++
  }

  return NextResponse.json({
    stageCounts,
    temperatureCounts,
    followupSentWeek,
    agendaWeek,
  })
}
