// Salva configurações de calendário do cliente: email para convites, calendar_id e calendar_mode.
// Não usa OAuth — a conta Google é central da Sales Tec (google_shared).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_MODES = ['google_shared', 'google_oauth', 'native'] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('panel_google_config')
    .select('calendar_mode, calendar_id, google_email')
    .eq('client_id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? { calendar_mode: null, calendar_id: null, google_email: null })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const body = await request.json()
  const { google_email, calendar_id, calendar_mode } = body

  // Validate calendar_mode if provided
  if (calendar_mode !== undefined && !VALID_MODES.includes(calendar_mode)) {
    return NextResponse.json({ error: `calendar_mode inválido: ${calendar_mode}` }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = {
    google_email: google_email || null,
    calendar_id: calendar_id || 'primary',
  }
  if (calendar_mode !== undefined) {
    updatePayload.calendar_mode = calendar_mode
  }

  // Check if record already exists
  const { data: existing } = await supabase
    .from('panel_google_config')
    .select('id')
    .eq('client_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('panel_google_config')
      .update(updatePayload)
      .eq('client_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('panel_google_config')
      .insert({
        id: crypto.randomUUID(),
        client_id: id,
        ...updatePayload,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
