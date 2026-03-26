// Endpoint do cron de follow-up: confirmações, lembretes e no-show.
// Deve ser chamado a cada hora pelo EasyPanel (ou cron externo).
// Protegido por CRON_SECRET via header Authorization.

import { NextRequest, NextResponse } from 'next/server'
import { runFollowupPipeline } from '@/lib/followup/confirmations'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const summary = await runFollowupPipeline()

    console.log('[Cron] followup concluído:', summary)

    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[Cron] Erro no followup pipeline:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Permite GET para facilitar teste manual no browser (sem precisar de curl)
export async function GET(req: NextRequest) {
  return POST(req)
}
