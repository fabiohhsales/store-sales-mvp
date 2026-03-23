import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createInstance, setChatwootIntegration, getN8nWebhookUrl } from '@/lib/api/evolution'
import { createChatwootAccount, findInboxByName, configureChatwootWebhook } from '@/lib/api/chatwoot'
import { createWhatsAppConfig } from '@/lib/db/whatsapp-config'
import { updateClient, getClientById } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { PanelWhatsAppConfigInsert } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { client_id, instance_name } = body

    if (!client_id || !instance_name) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: client_id, instance_name' },
        { status: 400 }
      )
    }

    const client = await getClientById(client_id)

    // Etapa 1 — Cria Account isolada no Chatwoot com o email real do cliente
    // O cliente recebe email de confirmação do Chatwoot e acessa só as conversas dele
    const chatwootAccount = await createChatwootAccount(
      client.name,
      client.email,
      client.owner_name,
      instance_name
    )

    // Etapa 2 — Configura webhook Chatwoot → n8n na nova Account
    const n8nWebhookUrl = getN8nWebhookUrl()
    await configureChatwootWebhook(chatwootAccount.id, chatwootAccount.access_token, n8nWebhookUrl)

    // Etapa 3 — Cria instância na Evolution apontando para a Account do cliente
    const evolutionResponse = await createInstance(instance_name, client.name, {
      accountId: chatwootAccount.id,
      agentToken: chatwootAccount.access_token,
    })

    // Etapa 3b — Garante que a integração Chatwoot está ativa na instância
    // (createInstance pode não ativar se o campo chatwoot_auto_create for ignorado)
    await setChatwootIntegration(
      instance_name,
      chatwootAccount.id,
      chatwootAccount.access_token,
      client.name
    )

    // Etapa 4 — Aguarda a Evolution criar o inbox no Chatwoot e busca o ID
    let chatwootInboxId: number | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 1500))
      const inbox = await findInboxByName(chatwootAccount.id, client.name, chatwootAccount.access_token)
      if (inbox) {
        chatwootInboxId = inbox.id
        break
      }
    }

    // Etapa 5 — Salva config completa no banco
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
      chatwoot_inbox_id: chatwootInboxId,
      chatwoot_account_id: chatwootAccount.id,
      chatwoot_agent_token: chatwootAccount.access_token,
    }

    const savedConfig = await createWhatsAppConfig(whatsappConfig)

    // Etapa 6 — Atualiza status e registra auditoria
    await updateClient(client_id, { status: 'pending_whatsapp' })

    await insertAuditLog({
      admin_email: user.email!,
      action: 'whatsapp_instance_created',
      client_id,
      details: {
        instance_name,
        instance_id: evolutionResponse.instance.instanceId,
        chatwoot_account_id: chatwootAccount.id,
        chatwoot_inbox_id: chatwootInboxId,
      },
    })

    return NextResponse.json(
      { config: savedConfig, qrcode: evolutionResponse.qrcode || null },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erro ao criar instância WhatsApp:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao criar instância WhatsApp' },
      { status: 500 }
    )
  }
}
