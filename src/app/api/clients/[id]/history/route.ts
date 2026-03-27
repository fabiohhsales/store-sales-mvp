import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// DELETE /api/clients/[id]/history — apaga mensagens e conversas do cliente
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createAdminClient()

  // Busca o chatwoot_account_id do cliente
  const { data: wConfig, error: wErr } = await supabase
    .from('panel_whatsapp_config')
    .select('chatwoot_account_id')
    .eq('client_id', id)
    .maybeSingle()

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  if (!wConfig?.chatwoot_account_id) {
    return NextResponse.json({ error: 'WhatsApp config não encontrado para este cliente' }, { status: 404 })
  }

  const accountId = Number(wConfig.chatwoot_account_id)

  // Busca IDs das conversas deste cliente
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 })

  const convIds = (convs ?? []).map((c) => c.id)

  if (convIds.length > 0) {
    const [msgRes, pauseRes, apptRes, convRes] = await Promise.all([
      supabase.from('messages').delete().in('conversation_id', convIds),
      supabase.from('ai_pauses').delete().in('conversation_id', convIds),
      supabase.from('appointments').delete().in('conversation_id', convIds),
      supabase.from('conversations').delete().in('id', convIds),
    ])

    const errs = [msgRes.error, pauseRes.error, apptRes.error, convRes.error].filter(Boolean)
    if (errs.length > 0) {
      return NextResponse.json({ error: errs.map((e) => e!.message).join('; ') }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, deleted: convIds.length, account_id: accountId })
}
