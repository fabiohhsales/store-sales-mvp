import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertAuditLog } from '@/lib/db/audit-log'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id: clientId } = await params
    const admin = createAdminClient()

    // Lê as duas fontes de credenciais Chatwoot
    const [{ data: clientRow }, { data: wConfig }] = await Promise.all([
      admin
        .from('panel_clients')
        .select('chatwoot_account_id, chatwoot_agent_token')
        .eq('id', clientId)
        .single(),
      admin
        .from('panel_whatsapp_config')
        .select('chatwoot_account_id, chatwoot_agent_token')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    const panelAccountId = clientRow?.chatwoot_account_id ?? null
    const panelToken = clientRow?.chatwoot_agent_token ?? null
    const wAccountId = wConfig?.chatwoot_account_id ?? null
    const wToken = wConfig?.chatwoot_agent_token ?? null

    const diagnosis = {
      panel_clients: {
        chatwoot_account_id: panelAccountId,
        has_token: !!panelToken,
      },
      panel_whatsapp_config: {
        chatwoot_account_id: wAccountId,
        has_token: !!wToken,
      },
      repaired: false,
      action: 'none' as string,
    }

    // Se panel_whatsapp_config está sem credentials mas panel_clients tem → copia
    if (wConfig && (!wAccountId || !wToken) && (panelAccountId || panelToken)) {
      const updates: Record<string, unknown> = {}
      if (!wAccountId && panelAccountId) updates.chatwoot_account_id = panelAccountId
      if (!wToken && panelToken) updates.chatwoot_agent_token = panelToken

      if (Object.keys(updates).length > 0) {
        const { error } = await admin
          .from('panel_whatsapp_config')
          .update(updates)
          .eq('client_id', clientId)

        if (error) {
          throw new Error(`Falha ao reparar panel_whatsapp_config: ${error.message}`)
        }

        diagnosis.repaired = true
        diagnosis.action = `Copiado chatwoot_account_id=${Object.keys(updates).join(', ')} de panel_clients → panel_whatsapp_config`
      }
    } else if (!wConfig && panelAccountId && panelToken) {
      // Não tem panel_whatsapp_config ainda — retorna informação apenas
      diagnosis.action = 'panel_whatsapp_config não encontrado. Configure o WhatsApp primeiro.'
    } else if (wAccountId && wToken) {
      diagnosis.action = 'Nenhuma ação necessária — credenciais já presentes em panel_whatsapp_config'
    } else {
      diagnosis.action = 'Sem credenciais em nenhuma das fontes. Refaça o onboarding WhatsApp.'
    }

    await insertAuditLog({
      admin_email: user.email!,
      action: 'chatwoot_repair',
      client_id: clientId,
      details: diagnosis,
    })

    return NextResponse.json(diagnosis)
  } catch (error) {
    console.error('Erro no repair-chatwoot:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
