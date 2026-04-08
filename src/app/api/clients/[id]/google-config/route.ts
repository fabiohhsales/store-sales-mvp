import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/clients/[id]/google-config — salva calendar_id e google_email
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { google_email, calendar_id, calendar_mode } = body

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('panel_google_config')
    .upsert(
      {
        client_id: id,
        google_email: google_email ?? null,
        calendar_id: calendar_id ?? null,
        ...(calendar_mode ? { calendar_mode } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
