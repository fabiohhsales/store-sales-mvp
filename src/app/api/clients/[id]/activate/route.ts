import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
