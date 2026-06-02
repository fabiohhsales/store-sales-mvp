// PATCH /api/desk/conversations/[id]/assign
// Atribui ou remove operador de uma conversa para o Desk (Store Sales).
// Body: { operator_id: string | null }

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

  if (!('operator_id' in body)) {
    return NextResponse.json({ error: 'operator_id é obrigatório (null para desatribuir)' }, { status: 400 })
  }

  const operatorId: string | null = body.operator_id ?? null
  const admin = createAdminClient()

  // Valida acesso à conversa
  const { data: conv } = await admin
    .from('store_conversations')
    .select('id, account_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.account_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Se atribuindo um operador, valida que ele pertence à mesma conta
  if (operatorId !== null) {
    const { data: op } = await admin
      .from('store_account_memberships')
      .select('id, is_active')
      .eq('user_id', operatorId)
      .eq('account_id', conv.account_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!op) {
      return NextResponse.json({ error: 'Operador não encontrado nesta conta' }, { status: 404 })
    }
  }

  const { data, error } = await admin
    .from('store_conversations')
    .update({ assigned_user_id: operatorId })
    .eq('id', conversationId)
    .select('id, assigned_user_id')
    .single()

  if (error) {
    console.error('[desk/assign] error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  console.log(`[desk/assign] conv=${conversationId} operator=${operatorId ?? 'none'}`)
  
  // Retorna no formato esperado pelo frontend
  return NextResponse.json({
    id: data.id,
    assigned_operator_id: data.assigned_user_id,
  })
}

// GET /api/desk/conversations/[id]/assign
// Lista operadores disponíveis para esta conta (para popular o select na UI)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Valida acesso e descobre o account_id da conversa
  const { data: conv } = await admin
    .from('store_conversations')
    .select('id, account_id, assigned_user_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.account_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Busca membros da conta com perfil detalhado
  const { data: memberships, error } = await admin
    .from('store_account_memberships')
    .select(`
      user_id,
      profile:store_user_profiles(id, email, display_name)
    `)
    .eq('account_id', conv.account_id)
    .eq('is_active', true)

  if (error) {
    console.error('[desk/assign] operators error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  const operators = (memberships ?? [])
    .map((m: any) => ({
      id: m.user_id,
      email: m.profile?.email || '',
      display_name: m.profile?.display_name || '',
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  return NextResponse.json({
    assigned_operator_id: conv.assigned_user_id,
    operators,
  })
}
