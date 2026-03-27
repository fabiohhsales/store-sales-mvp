// Endpoint do cron de follow-up: confirmações, lembretes e no-show.
// Deve ser chamado a cada hora pelo EasyPanel (ou cron externo).
// Protegido por CRON_SECRET via header Authorization.

import { NextRequest, NextResponse } from 'next/server'
import { runFollowupPipeline } from '@/lib/followup/confirmations'

function checkAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Cron] CRON_SECRET não configurado — endpoint bloqueado')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const authError = checkAuth(req)
  if (authError) return authError

  try {
    const summary = await runFollowupPipeline()
    console.log('[Cron] followup concluído:', summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[Cron] Erro no followup pipeline:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
