import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createInstance,
  deleteInstance,
  getPanelChatwootWebhookUrl,
  getPanelEvolutionWebhookUrl,
  setChatwootIntegration,
  setWebhook,
} from '@/lib/api/evolution'
import { createChatwootAccount, createChatwootAgent, findInboxByName, configureChatwootWebhook, deleteChatwootAccount, ensureChatwootLabels } from '@/lib/api/chatwoot'
import { createWhatsAppConfig } from '@/lib/db/whatsapp-config'
import { getBotConfigByClientId } from '@/lib/db/bot-config'
import { updateClient, getClientById } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import { DEFAULT_STAGE_LABELS, sanitizeStageLabels } from '@/lib/bot/stage-labels'
import type { PanelWhatsAppConfigInsert } from '@/types/database'
import type { ChatwootAccount } from '@/types/api'

type ChatwootAccountCredentials = Pick<ChatwootAccount, 'id' | 'access_token' | 'login_email'>

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
    const provisionedAgents = client.provisioned_agents ?? []
    const agentsSummary = {
      created: [] as string[],
      existing: [] as string[],
      failed: [] as Array<{ email: string; reason: string }>,
    }

    // Tracking pra cleanup em caso de erro parcial
    let chatwootAccountId: number | null = null
    let chatwootToken: string | null = null
    let evolutionCreated = false
    let accountCreatedNow = false

    // Verifica se já existe uma account Chatwoot pré-provisionada para este cliente
    const existingAccountId = client.chatwoot_account_id ?? null
    const existingToken = client.chatwoot_agent_token ?? null

    try {
      let chatwootAccount: ChatwootAccountCredentials

      if (existingAccountId && existingToken) {
        // Reutiliza account pré-provisionada (criada no cadastro do cliente)
        console.log(`[WhatsApp] Etapa 1: Reutilizando Account Chatwoot #${existingAccountId} para "${client.name}"`)
        chatwootAccount = {
          id: existingAccountId,
          access_token: existingToken,
          login_email: client.chatwoot_email ?? client.email,
        }
        chatwootAccountId = existingAccountId
        chatwootToken = existingToken
        accountCreatedNow = false
      } else {
        // Cria nova account (fallback: cliente não passou pelo fluxo de provisionamento)
        console.log(`[WhatsApp] Etapa 1: Criando Account Chatwoot para "${client.name}"`)
        const newAccount = await createChatwootAccount(
          client.name,
          client.email,
          client.owner_name,
          instance_name
        )
        chatwootAccount = newAccount
        chatwootAccountId = newAccount.id
        chatwootToken = newAccount.access_token
        accountCreatedNow = true
      }

      const chatwootLoginEmail = chatwootAccount.login_email ?? client.chatwoot_email ?? client.email

      // Etapa 2 — Configura webhook Chatwoot → painel
      console.log(`[WhatsApp] Etapa 2: Configurando webhook Chatwoot (Account ${chatwootAccount.id})`)
      const panelChatwootWebhookUrl = getPanelChatwootWebhookUrl()
      await configureChatwootWebhook(chatwootAccount.id, chatwootAccount.access_token, panelChatwootWebhookUrl)

      // Etapa 2b — Sincroniza etiquetas padrão/configuradas na account do cliente
      console.log(`[WhatsApp] Etapa 2b: Sincronizando etiquetas no Chatwoot (Account ${chatwootAccount.id})`)
      try {
        const botConfig = await getBotConfigByClientId(client_id)
        const stageLabels = sanitizeStageLabels(botConfig?.stage_labels ?? DEFAULT_STAGE_LABELS)
        await ensureChatwootLabels(chatwootAccount.id, chatwootAccount.access_token, stageLabels)
      } catch (err) {
        console.warn('[WhatsApp] Sync de etiquetas falhou (não-crítico):', err)
      }

      // Etapa 2c — Provisiona agentes apenas se a account foi criada agora
      // (se reutilizamos uma account pré-existente, os agentes já foram criados no cadastro)
      if (accountCreatedNow && provisionedAgents.length > 0) {
        console.log(`[WhatsApp] Etapa 2c: Provisionando ${provisionedAgents.length} agente(s) no Chatwoot`)
        for (const agent of provisionedAgents) {
          try {
            const result = await createChatwootAgent(
              chatwootAccount.id,
              chatwootAccount.access_token,
              agent
            )

            if (result.status === 'exists') {
              agentsSummary.existing.push(agent.email)
            } else {
              agentsSummary.created.push(agent.email)
            }
          } catch (agentError) {
            const reason = agentError instanceof Error ? agentError.message : 'Erro desconhecido ao provisionar agente'
            agentsSummary.failed.push({ email: agent.email, reason })
          }
        }
      }

      // Etapa 3 — Cria instância na Evolution
      console.log(`[WhatsApp] Etapa 3: Criando instância Evolution "${instance_name}"`)
      const evolutionResponse = await createInstance(instance_name, client.name, {
        accountId: chatwootAccount.id,
        agentToken: chatwootAccount.access_token,
      })
      evolutionCreated = true

      const evolutionWebhookUrl = getPanelEvolutionWebhookUrl()
      console.log(`[WhatsApp] Etapa 3a: Configurando webhook direto da Evolution`)
      await setWebhook(instance_name, evolutionWebhookUrl)

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
        webhook_url: evolutionWebhookUrl,
        chatwoot_inbox_id: chatwootInboxId,
        chatwoot_email: chatwootLoginEmail,
        chatwoot_account_id: chatwootAccount.id,
        chatwoot_agent_token: chatwootAccount.access_token,
      }

      const savedConfig = await createWhatsAppConfig(whatsappConfig)

      await updateClient(client_id, {
        chatwoot_account_id: chatwootAccount.id,
        chatwoot_agent_token: chatwootAccount.access_token,
        chatwoot_email: chatwootLoginEmail,
      })

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
          chatwoot_email: chatwootLoginEmail,
          chatwoot_inbox_id: chatwootInboxId,
          agents_summary: {
            created: agentsSummary.created.length,
            existing: agentsSummary.existing.length,
            failed: agentsSummary.failed.length,
          },
        },
      })

      console.log(`[WhatsApp] Instância "${instance_name}" criada com sucesso!`)

      return NextResponse.json(
        {
          config: savedConfig,
          qrcode: evolutionResponse.qrcode || null,
          agents_summary: agentsSummary,
        },
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

      if (accountCreatedNow && chatwootAccountId && chatwootToken) {
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
