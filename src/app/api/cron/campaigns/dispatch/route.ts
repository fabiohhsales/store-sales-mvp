import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'

export const dynamic = 'force-dynamic'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  // Opcional: Proteger a rota do cron com uma chave de segurança
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  const cronSecret = process.env.CRON_SECRET || 'chatsales_secret'
  
  if (key !== cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const nowIso = new Date().toISOString()

    // 1. Encontrar campanhas ativas ('sending') ou agendadas prontas para disparar
    const { data: campaigns, error: campErr } = await supabase
      .from('store_campaigns')
      .select('*')
      .or(`status.eq.sending,and(status.eq.scheduled,scheduled_at.lte.${nowIso})`)

    if (campErr) throw campErr

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhuma campanha pendente para disparo.' })
    }

    const processedCampaigns = []

    for (const campaign of campaigns) {
      // Se estava agendada, atualiza para sending
      if (campaign.status === 'scheduled') {
        await supabase
          .from('store_campaigns')
          .update({ status: 'sending', updated_at: nowIso })
          .eq('id', campaign.id)
        campaign.status = 'sending'
      }

      // 2. Buscar lote de contatos pendentes nesta campanha
      const { data: audiences, error: audErr } = await supabase
        .from('store_campaign_audiences')
        .select(`
          id,
          contact_id,
          status,
          store_contacts (
            id,
            name,
            phone_number,
            remote_jid
          )
        `)
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .limit(5) // Lote pequeno para processamento cadenciado e evitar timeouts na rota do cron

      if (audErr) {
        console.error(`[Campaign-Cron] Erro ao buscar audiência da campanha ${campaign.id}:`, audErr.message)
        continue
      }

      if (!audiences || audiences.length === 0) {
        // Campanhas sem contatos pendentes -> Concluída!
        await supabase
          .from('store_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaign.id)
        
        processedCampaigns.push({ campaign_id: campaign.id, status: 'completed' })
        continue
      }

      // 3. Buscar canal/instância de envio ativa para a conta da campanha
      const { data: channel } = await supabase
        .from('store_channels')
        .select('evolution_instance_name')
        .eq('account_id', campaign.account_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      let instanceName = channel?.evolution_instance_name
      if (!instanceName) {
        // Fallback para panel_whatsapp_config legado
        const { data: whatsappConfig } = await supabase
          .from('panel_whatsapp_config')
          .select('evolution_instance_name')
          .eq('client_id', campaign.account_id)
          .maybeSingle()
        instanceName = whatsappConfig?.evolution_instance_name
      }

      if (!instanceName) {
        console.error(`[Campaign-Cron] Canal ativo ou instância WhatsApp não configurada para conta=${campaign.account_id}. Campanha suspensa.`)
        await supabase
          .from('store_campaigns')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', campaign.id)
        
        processedCampaigns.push({ campaign_id: campaign.id, status: 'failed', error: 'no_active_channel' })
        continue
      }

      let localSent = 0
      let localFailed = 0

      // 4. Enviar mensagens com delay cadenciado
      for (const aud of audiences) {
        const contact: any = aud.store_contacts
        if (!contact) {
          await supabase
            .from('store_campaign_audiences')
            .update({ status: 'failed', error_message: 'Contato não encontrado' })
            .eq('id', aud.id)
          localFailed++
          continue
        }

        const recipient = contact.remote_jid || contact.phone_number
        if (!recipient) {
          await supabase
            .from('store_campaign_audiences')
            .update({ status: 'failed', error_message: 'Telefone ou JID ausente' })
            .eq('id', aud.id)
          localFailed++
          continue
        }

        // Substituir variáveis no template
        const customerFirstName = (contact.name || 'Cliente').split(' ')[0]
        const personalizedMessage = campaign.message_template
          .replace(/{nome}/gi, customerFirstName)
          .replace(/{name}/gi, customerFirstName)
          .replace(/{fullname}/gi, contact.name || 'Cliente')

        try {
          // Enviar via Evolution WhatsApp API
          const evolutionMsgId = await sendTextMessage(instanceName, recipient, personalizedMessage)

          // a. Resolver ou criar conversa para logar histórico no painel Desk
          let conversationId: string
          const { data: existingConv } = await supabase
            .from('store_conversations')
            .select('id')
            .eq('contact_id', contact.id)
            .eq('account_id', campaign.account_id)
            .maybeSingle()

          if (existingConv) {
            conversationId = existingConv.id
          } else {
            conversationId = crypto.randomUUID()
            await supabase.from('store_conversations').insert({
              id: conversationId,
              account_id: campaign.account_id,
              store_id: campaign.store_id || null,
              channel_id: null,
              contact_id: contact.id,
              operational_status: 'bot_active',
              commercial_stage: 'new_lead',
            })
          }

          // b. Salvar log na tabela de store_messages
          const messageId = crypto.randomUUID()
          await supabase.from('store_messages').insert({
            id: messageId,
            account_id: campaign.account_id,
            store_id: campaign.store_id || null,
            conversation_id: conversationId,
            contact_id: contact.id,
            content: personalizedMessage,
            content_type: 'text',
            sender_type: 'agent_bot',
            from_who: 'ai',
            evolution_message_id: evolutionMsgId || null,
            created_at: new Date().toISOString(),
          })

          // c. Registrar na tabela de store_campaign_messages
          await supabase.from('store_campaign_messages').insert({
            id: crypto.randomUUID(),
            campaign_id: campaign.id,
            message_id: messageId,
            status: 'sent',
          })

          // d. Atualizar audiência para sent
          await supabase
            .from('store_campaign_audiences')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', aud.id)

          // e. Atualizar conversa
          await supabase
            .from('store_conversations')
            .update({
              last_outgoing_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId)

          localSent++
        } catch (sendErr: any) {
          console.error(`[Campaign-Cron] Falha ao enviar WhatsApp para ${recipient}:`, sendErr.message)
          await supabase
            .from('store_campaign_audiences')
            .update({ status: 'failed', error_message: sendErr.message || 'Falha de envio API' })
            .eq('id', aud.id)
          localFailed++
        }

        // Delay aleatório cadenciado de 5 a 10 segundos para emular comportamento humano
        const delayMs = Math.floor(Math.random() * 5000) + 5000
        await sleep(delayMs)
      }

      // 5. Atualizar contadores na tabela de campanhas
      const currentSent = (campaign.sent_count || 0) + localSent
      const currentFailed = (campaign.failed_count || 0) + localFailed
      
      await supabase
        .from('store_campaigns')
        .update({
          sent_count: currentSent,
          failed_count: currentFailed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id)

      processedCampaigns.push({
        campaign_id: campaign.id,
        processed: audiences.length,
        sent: localSent,
        failed: localFailed,
      })
    }

    return NextResponse.json({ ok: true, processed: processedCampaigns })
  } catch (error: any) {
    console.error('[Campaign-Cron] Erro inesperado:', error)
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 })
  }
}
