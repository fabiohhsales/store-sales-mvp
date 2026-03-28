// Endpoint do cron de follow-up: confirmações, lembretes e no-show.
// Deve ser chamado a cada hora pelo EasyPanel (ou cron externo).
// Protegido por CRON_SECRET via header Authorization.
//
// OBS: Este endpoint foi desativado para evitar concorrencia com
// /api/cron/followup-agendado (novo motor de agendado).
// O arquivo de implementação legado foi mantido em
// src/lib/followup/confirmations.ts para historico/rollback controlado.

import { NextRequest, NextResponse } from 'next/server'
// import { runFollowupPipeline } from '@/lib/followup/confirmations'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Legado inativado intencionalmente.
  // Para reativar em contingencia, restaure o import e descomente o bloco abaixo.
  // try {
  //   const summary = await runFollowupPipeline()
  //   console.log('[Cron] followup concluído:', summary)
  //   return NextResponse.json({ ok: true, ...summary })
  // } catch (err) {
  //   console.error('[Cron] Erro no followup pipeline:', err)
  //   return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  // }

  return NextResponse.json(
    {
      ok: false,
      deactivated: true,
      message: 'Endpoint legado desativado. Use /api/cron/followup-agendado.',
    },
    { status: 410 }
  )
}

// Permite GET para facilitar teste manual no browser (sem precisar de curl)
export async function GET(req: NextRequest) {
  return POST(req)
}
