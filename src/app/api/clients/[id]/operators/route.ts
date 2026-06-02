import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/clients/[id]/operators — lista operadores do cliente
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('panel_users')
    .select('id, email, display_name, client_role, is_active, created_at')
    .eq('client_id', clientId)
    .eq('role', 'operator')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[operators] GET error:', error)
    return NextResponse.json({ error: 'Erro ao listar operadores' }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST /api/clients/[id]/operators — cria operador (auth user + panel_users)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clientId } = await params
  const body = await request.json()
  const { email, display_name, password, client_role } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'email e password são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Cria usuário no Supabase Auth
  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !authData.user) {
    console.error('[operators] createUser error:', createError)
    const msg = createError?.message ?? 'Erro ao criar usuário'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Cria registro em panel_users
  const { data: panelUser, error: insertError } = await admin
    .from('panel_users')
    .insert({
      id: authData.user.id,
      email,
      role: 'operator',
      client_id: clientId,
      display_name: display_name ?? null,
      client_role: client_role || 'agent',
      is_active: true,
    })
    .select('id, email, display_name, client_role, is_active, created_at')
    .single()

  if (insertError) {
    console.error('[operators] insert panel_users error:', insertError)
    // Rollback: remove auth user criado
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Erro ao criar operador' }, { status: 500 })
  }

  return NextResponse.json(panelUser, { status: 201 })
}
