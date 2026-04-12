import { NextRequest, NextResponse } from 'next/server'
import { runLeadCadencePipeline } from '@/lib/followup/lead-cadence'
import { runAtendimentoCadencePipeline } from '@/lib/followup/atendimento-cadence'
import { reconcileOrphanedSteps } from '@/lib/followup/shared'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Reconcile orphaned steps before running new cadences
    const reconciled = await reconcileOrphanedSteps().catch((err) => {
      console.error('[Cron] Erro na reconciliação de steps:', err)
      return 0
    })

    const [leadSummary, atendimentoSummary] = await Promise.all([
      runLeadCadencePipeline(),
      runAtendimentoCadencePipeline(),
    ])

    return NextResponse.json({
      ok: true,
      reconciled,
      leadClients: leadSummary.clients,
      leadStepsSent: leadSummary.stepsSent,
      atendimentoClients: atendimentoSummary.clients,
      atendimentoStepsSent: atendimentoSummary.stepsSent,
      skippedOutsideHours: leadSummary.skippedOutsideHours,
      errors: [],
    })
  } catch (error) {
    console.error('[Cron] Erro no followup-cadencia:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
