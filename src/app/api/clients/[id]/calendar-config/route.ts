// Salva configurações de calendário do cliente: email para convites, calendar_id e calendar_mode.
// Usa admin client para contornar RLS. Auth via session cookie.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_MODES = ['google_shared', 'google_oauth', 'native'] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
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
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const admin = createAdminClient()

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
  const { data: existing } = await admin
    .from('panel_google_config')
    .select('id')
    .eq('client_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from('panel_google_config')
      .update(updatePayload)
      .eq('client_id', id)

    if (error) {
      console.error('[calendar-config] update error', { clientId: id, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await admin
      .from('panel_google_config')
      .insert({
        id: crypto.randomUUID(),
        client_id: id,
        ...updatePayload,
      })

    if (error) {
      console.error('[calendar-config] insert error', { clientId: id, error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
