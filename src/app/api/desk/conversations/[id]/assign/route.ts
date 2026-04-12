// PATCH /api/desk/conversations/[id]/assign
// Atribui ou remove operador de uma conversa.
// Body: { operator_id: string | null }
//   - operator_id: UUID de panel_users (role=operator, client_id=cliente)
//   - null: desatribui (campo fica null)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()

  // operator_id pode ser string (UUID) ou null para desatribuir
  if (!('operator_id' in body)) {
    return NextResponse.json({ error: 'operator_id é obrigatório (null para desatribuir)' }, { status: 400 })
  }

  const operatorId: string | null = body.operator_id ?? null

  const admin = createAdminClient()

  // Valida acesso à conversa
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Se atribuindo um operador, valida que ele pertence ao mesmo cliente
  if (operatorId !== null) {
    const { data: op } = await admin
      .from('panel_users')
      .select('id, is_active')
      .eq('id', operatorId)
      .eq('client_id', conv.client_id)
      .eq('role', 'operator')
      .maybeSingle()

    if (!op) {
      return NextResponse.json({ error: 'Operador não encontrado neste cliente' }, { status: 404 })
    }
    if (!op.is_active) {
      return NextResponse.json({ error: 'Operador inativo' }, { status: 422 })
    }
  }

  const { data, error } = await admin
    .from('conversations')
    .update({ assigned_operator_id: operatorId })
    .eq('id', conversationId)
    .select('id, assigned_operator_id')
    .single()

  if (error) {
    console.error('[desk/assign] error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  console.log(`[desk/assign] conv=${conversationId} operator=${operatorId ?? 'none'}`)
  return NextResponse.json(data)
}

// GET /api/desk/conversations/[id]/assign
// Lista operadores disponíveis para este cliente (para popular o select na UI)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Valida acesso e descobre o client_id da conversa
  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id, assigned_operator_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { data: operators, error } = await admin
    .from('panel_users')
    .select('id, email, display_name')
    .eq('client_id', conv.client_id)
    .eq('role', 'operator')
    .eq('is_active', true)
    .order('display_name', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('[desk/assign] operators error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  return NextResponse.json({
    assigned_operator_id: conv.assigned_operator_id,
    operators: operators ?? [],
  })
}
