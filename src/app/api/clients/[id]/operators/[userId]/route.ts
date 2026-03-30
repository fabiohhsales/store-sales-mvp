import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH /api/clients/[id]/operators/[userId] — atualiza display_name ou is_active
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId, userId } = await params
  const body = await request.json()

  // Apenas estes campos são permitidos via PATCH
  const allowed: Record<string, unknown> = {}
  if ('display_name' in body) allowed.display_name = body.display_name
  if ('is_active' in body) allowed.is_active = Boolean(body.is_active)

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('panel_users')
    .update(allowed)
    .eq('id', userId)
    .eq('client_id', clientId)
    .eq('role', 'operator')
    .select('id, email, display_name, is_active, created_at')
    .single()

  if (error) {
    console.error('[operators] PATCH error:', error)
    return NextResponse.json({ error: 'Operador não encontrado' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// DELETE /api/clients/[id]/operators/[userId] — desativa operador (soft delete)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId, userId } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('panel_users')
    .update({ is_active: false })
    .eq('id', userId)
    .eq('client_id', clientId)
    .eq('role', 'operator')
    .select('id, email, display_name, is_active')
    .single()

  if (error) {
    console.error('[operators] DELETE error:', error)
    return NextResponse.json({ error: 'Operador não encontrado' }, { status: 404 })
  }

  return NextResponse.json(data)
}
