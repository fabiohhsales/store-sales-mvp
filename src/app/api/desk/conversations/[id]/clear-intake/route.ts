// DELETE /api/desk/conversations/[id]/clear-intake
// Zera custom_data e intake_completed_at do contato da conversa — usado para testes.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Rota de debug — apenas admins podem limpar intake em produção
  if (!deskUser.isAdmin) {
    return NextResponse.json({ error: 'Apenas admins podem executar esta operação de debug' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversations')
    .select('client_id, contact_id')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  await admin.from('contacts').update({
    custom_data: {},
    intake_completed_at: null,
  }).eq('id', conv.contact_id)

  console.log(`[desk/clear-intake] conv=${id} contact=${conv.contact_id} intake limpo por user=${deskUser.userId}`)
  return NextResponse.json({ ok: true })
}
