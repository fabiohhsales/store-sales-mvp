import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createInstance, setChatwootIntegration, getN8nWebhookUrl, deleteInstance } from '@/lib/api/evolution'
import { createChatwootAccount, findInboxByName, configureChatwootWebhook, deleteChatwootAccount } from '@/lib/api/chatwoot'
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

    // Tracking pra cleanup em caso de erro parcial
    let chatwootAccountId: number | null = null
    let chatwootToken: string | null = null
    let evolutionCreated = false

    try {
      // Etapa 1 — Cria Account isolada no Chatwoot
      console.log(`[WhatsApp] Etapa 1: Criando Account Chatwoot para "${client.name}"`)
      const chatwootAccount = await createChatwootAccount(
        client.name,
        client.email,
        client.owner_name,
        instance_name
      )
      chatwootAccountId = chatwootAccount.id
      chatwootToken = chatwootAccount.access_token

      // Etapa 2 — Configura webhook Chatwoot → n8n
      console.log(`[WhatsApp] Etapa 2: Configurando webhook Chatwoot (Account ${chatwootAccount.id})`)
      const n8nWebhookUrl = getN8nWebhookUrl()
      await configureChatwootWebhook(chatwootAccount.id, chatwootAccount.access_token, n8nWebhookUrl)

      // Etapa 3 — Cria instância na Evolution
      console.log(`[WhatsApp] Etapa 3: Criando instância Evolution "${instance_name}"`)
      const evolutionResponse = await createInstance(instance_name, client.name, {
        accountId: chatwootAccount.id,
        agentToken: chatwootAccount.access_token,
      })
      evolutionCreated = true

      // Etapa 3b — Garante integração Chatwoot ativa
      console.log(`[WhatsApp] Etapa 3b: Garantindo integração Chatwoot`)
      try {
        await setChatwootIntegration(
          instance_name,
          chatwootAccount.id,
          chatwootAccount.access_token,
          client.name
        )
      } catch (err) {
        console.warn('[WhatsApp] setChatwootIntegration falhou (não-crítico):', err)
      }

      // Etapa 4 — Aguarda inbox (não-crítico, continua se não encontrar)
      console.log(`[WhatsApp] Etapa 4: Buscando inbox no Chatwoot`)
      let chatwootInboxId: number | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 1500))
        const inbox = await findInboxByName(chatwootAccount.id, client.name, chatwootAccount.access_token)
        if (inbox) {
          chatwootInboxId = inbox.id
          break
        }
      }
      if (!chatwootInboxId) {
        console.warn('[WhatsApp] Inbox não encontrado após 5 tentativas (vai ser criado quando conectar)')
      }

      // Etapa 5 — Salva no banco
      console.log(`[WhatsApp] Etapa 5: Salvando config no banco`)
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
      console.log(`[WhatsApp] Etapa 6: Atualizando status do cliente`)
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

      console.log(`[WhatsApp] Instância "${instance_name}" criada com sucesso!`)

      return NextResponse.json(
        { config: savedConfig, qrcode: evolutionResponse.qrcode || null },
        { status: 201 }
      )
    } catch (innerError) {
      // Cleanup: desfaz o que foi criado pra não deixar lixo
      console.error(`[WhatsApp] Erro na criação, fazendo cleanup...`, innerError)

      if (evolutionCreated) {
        try {
          await deleteInstance(instance_name)
          console.log(`[WhatsApp] Cleanup: instância Evolution "${instance_name}" deletada`)
        } catch { /* ignora */ }
      }

      if (chatwootAccountId && chatwootToken) {
        try {
          await deleteChatwootAccount(chatwootAccountId, chatwootToken)
          console.log(`[WhatsApp] Cleanup: Account Chatwoot #${chatwootAccountId} deletada`)
        } catch { /* ignora */ }
      }

      throw innerError
    }
  } catch (error) {
    console.error('Erro ao criar instância WhatsApp:', error)
    const message = error instanceof Error ? error.message : 'Erro interno ao criar instância WhatsApp'
    // Limpa HTML de mensagens de erro de APIs externas
    const cleanMessage = message.startsWith('<!') || message.includes('<!DOCTYPE')
      ? 'Erro de comunicação com serviço externo (Chatwoot ou Evolution). Tente novamente.'
      : message
    return NextResponse.json(
      { error: cleanMessage },
      { status: 500 }
    )
  }
}
