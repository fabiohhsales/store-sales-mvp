import { NextRequest, NextResponse } from 'next/server'
import { resolveDeskUser } from '@/lib/desk/auth'
import { runAgendadoCadencePipeline } from '@/lib/followup/agendado-cadence'
import { runAtendimentoCadencePipeline } from '@/lib/followup/atendimento-cadence'
import { runLeadCadencePipeline } from '@/lib/followup/lead-cadence'
import { reconcileOrphanedSteps } from '@/lib/followup/shared'

type RunCadence = 'lead' | 'atendimento' | 'agendado' | 'all'

function isRunCadence(value: unknown): value is RunCadence {
  return value === 'lead' || value === 'atendimento' || value === 'agendado' || value === 'all'
}

export async function POST(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  if (!deskUser.isAdmin) {
    return NextResponse.json({ error: 'Apenas admins podem disparar a cadencia manualmente' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const clientId = typeof body?.client_id === 'string' ? body.client_id : ''
  const cadence = body?.cadence

  if (!clientId) {
    return NextResponse.json({ error: 'client_id obrigatorio' }, { status: 400 })
  }

  if (!isRunCadence(cadence)) {
    return NextResponse.json({ error: 'cadence invalida' }, { status: 400 })
  }

  const shouldRunLead = cadence === 'lead' || cadence === 'all'
  const shouldRunAtendimento = cadence === 'atendimento' || cadence === 'all'
  const shouldRunAgendado = cadence === 'agendado' || cadence === 'all'

  const reconciled = shouldRunLead || shouldRunAtendimento ? await reconcileOrphanedSteps() : 0
  const [leadSummary, atendimentoSummary, agendadoSummary] = await Promise.all([
    shouldRunLead ? runLeadCadencePipeline(clientId) : Promise.resolve(null),
    shouldRunAtendimento ? runAtendimentoCadencePipeline(clientId) : Promise.resolve(null),
    shouldRunAgendado ? runAgendadoCadencePipeline(clientId) : Promise.resolve(null),
  ])

  return NextResponse.json({
    ok: true,
    client_id: clientId,
    cadence,
    reconciled,
    lead: leadSummary,
    atendimento: atendimentoSummary,
    agendado: agendadoSummary,
  })
}
