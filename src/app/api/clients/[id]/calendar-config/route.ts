// Salva configurações de calendário do cliente: email para convites + calendar_id.
// Não usa OAuth — a conta Google é central da Sales Tec.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { id } = params

  const body = await request.json()
  const { google_email, calendar_id } = body

  const { error } = await supabase
    .from('panel_google_config')
    .upsert(
      {
        client_id: id,
        google_email: google_email || null,
        calendar_id: calendar_id || 'primary',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
