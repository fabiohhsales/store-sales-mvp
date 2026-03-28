// Endpoint do cron de follow-up agendado: D-2, -3h, -5min antes da consulta.
// Deve ser chamado a cada 5 minutos pelo EasyPanel (ou cron externo).
// Protegido por CRON_SECRET via header Authorization.

import { NextRequest, NextResponse } from 'next/server'
import { runAgendadoCadencePipeline } from '@/lib/followup/agendado-cadence'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const summary = await runAgendadoCadencePipeline()

    console.log('[Cron] followup-agendado concluído:', summary)

    return NextResponse.json({
      ok: true,
      clients: summary.clients,
      stepsSent: summary.stepsSent,
      skippedOutsideHours: summary.skippedOutsideHours,
    })
  } catch (error) {
    console.error('[Cron] Erro no followup-agendado:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
