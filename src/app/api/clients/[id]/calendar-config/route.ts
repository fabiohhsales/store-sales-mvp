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

  // Check if record already exists
  const { data: existing } = await supabase
    .from('panel_google_config')
    .select('id')
    .eq('client_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('panel_google_config')
      .update({
        google_email: google_email || null,
        calendar_id: calendar_id || 'primary',
      })
      .eq('client_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('panel_google_config')
      .insert({
        id: crypto.randomUUID(),
        client_id: id,
        google_email: google_email || null,
        calendar_id: calendar_id || 'primary',
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
