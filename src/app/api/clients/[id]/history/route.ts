import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// DELETE /api/clients/[id]/history — apaga mensagens e conversas do cliente
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Busca o chatwoot_account_id do cliente
  const { data: wConfig } = await supabase
    .from('panel_whatsapp_config')
    .select('chatwoot_account_id')
    .eq('client_id', id)
    .maybeSingle()

  if (!wConfig?.chatwoot_account_id) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  // Busca IDs das conversas deste cliente
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', wConfig.chatwoot_account_id)

  const convIds = (convs ?? []).map((c) => c.id)

  if (convIds.length > 0) {
    // Deleta mensagens
    await supabase.from('messages').delete().in('conversation_id', convIds)
    // Deleta ai_pauses
    await supabase.from('ai_pauses').delete().in('conversation_id', convIds)
    // Deleta appointments
    await supabase.from('appointments').delete().in('conversation_id', convIds)
    // Deleta conversas
    await supabase.from('conversations').delete().in('id', convIds)
  }

  return NextResponse.json({ ok: true, deleted: convIds.length })
}
