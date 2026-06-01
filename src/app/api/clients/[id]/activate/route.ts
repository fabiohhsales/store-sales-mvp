import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientById, updateClient } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Busca cliente com relações pra validar
    const client = await getClientById(id)

    if (!client) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      )
    }

    // Valida que WhatsApp e bot config existem
    if (!client.panel_whatsapp_config) {
      return NextResponse.json(
        { error: 'Configuração do WhatsApp não encontrada. Complete a etapa de WhatsApp primeiro.' },
        { status: 400 }
      )
    }

    if (!client.panel_bot_config) {
      return NextResponse.json(
        { error: 'Configuração do bot não encontrada. Complete a etapa de configuração primeiro.' },
        { status: 400 }
      )
    }

    // Se o segmento é loja, garante inicialização da loja/store
    if (client.panel_bot_config?.business_segment === 'loja') {
      const adminDb = createAdminClient()
      const { data: existingStore } = await adminDb
        .from('stores')
        .select('id')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle()

      if (!existingStore) {
        // Inicializa store
        const storeId = crypto.randomUUID()
        const { error: storeErr } = await adminDb
          .from('stores')
          .insert({
            id: storeId,
            client_id: id,
            name: client.name,
          })

        if (storeErr) {
          console.error('[Activate] Falha ao auto-inicializar store:', storeErr)
        } else {
          // Inicializa store_agent_settings
          const { error: settingsErr } = await adminDb
            .from('store_agent_settings')
            .insert({
              id: crypto.randomUUID(),
              client_id: id,
              store_id: storeId,
              whatsapp_config_id: client.panel_whatsapp_config.id,
              agent_name: 'Vendedor Virtual',
              tone_of_voice: 'consultivo, objetivo e cordial',
              auto_reply_enabled: true,
              rag_enabled: true,
            })

          if (settingsErr) {
            console.error('[Activate] Falha ao auto-inicializar store_agent_settings:', settingsErr)
          } else {
            console.log(`[Activate] Módulo de Loja inicializado com sucesso para cliente ${id}`)
          }
        }
      }
    }

    // Ativa o cliente
    const updatedClient = await updateClient(id, { status: 'active' })

    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_activated',
      client_id: id,
      details: {
        previous_status: client.status,
        whatsapp_instance: client.panel_whatsapp_config.evolution_instance_name,
        has_google_config: !!client.panel_google_config,
      },
    })

    return NextResponse.json(updatedClient)
  } catch (error) {
    console.error('Erro ao ativar cliente:', error)
    return NextResponse.json(
      { error: 'Erro interno ao ativar cliente' },
      { status: 500 }
    )
  }
}
