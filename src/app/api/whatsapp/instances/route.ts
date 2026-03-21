import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createInstance, getN8nWebhookUrl } from '@/lib/api/evolution'
import { createWhatsAppConfig } from '@/lib/db/whatsapp-config'
import { updateClient, getClientById } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { PanelWhatsAppConfigInsert } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { client_id, instance_name } = body

    if (!client_id || !instance_name) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: client_id, instance_name' },
        { status: 400 }
      )
    }

    // Busca o cliente pra usar o nome na criação da instância
    const client = await getClientById(client_id)

    // Cria instância na Evolution API
    const evolutionResponse = await createInstance(instance_name, client.name)

    const n8nWebhookUrl = getN8nWebhookUrl()

    // Salva config do WhatsApp no banco
    const whatsappConfig: PanelWhatsAppConfigInsert = {
      client_id,
      evolution_instance_name: instance_name,
      evolution_instance_id: evolutionResponse.instance.instanceId || null,
      evolution_instance_token: evolutionResponse.instance.token || null,
      connection_status: 'disconnected',
      connected_phone: null,
      connected_at: null,
      disconnected_at: null,
      webhook_url: n8nWebhookUrl,
      chatwoot_inbox_id: null,
    }

    const savedConfig = await createWhatsAppConfig(whatsappConfig)

    // Atualiza status do cliente
    await updateClient(client_id, { status: 'pending_whatsapp' })

    // Log de auditoria
    await insertAuditLog({
      admin_email: user.email!,
      action: 'whatsapp_instance_created',
      client_id,
      details: {
        instance_name,
        instance_id: evolutionResponse.instance.instanceId,
      },
    })

    return NextResponse.json(
      {
        config: savedConfig,
        qrcode: evolutionResponse.qrcode || null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erro ao criar instância WhatsApp:', error)
    return NextResponse.json(
      { error: 'Erro interno ao criar instância WhatsApp' },
      { status: 500 }
    )
  }
}
