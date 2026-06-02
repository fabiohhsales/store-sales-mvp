import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'
import { sendTextMessage } from '@/lib/api/evolution'

const RETAIL_STAGES = [
  'new_lead',
  'product_discovery',
  'product_recommended',
  'price_requested',
  'quote_requested',
  'payment_link_sent',
  'negotiation',
  'won',
  'lost',
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, client_id, conversation_id, content, auto_move_enabled, auto_move_to_stage } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id é obrigatório' }, { status: 400 })
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content é obrigatório' }, { status: 400 })
    }

    let accountId: string | null = null

    if (token || client_id) {
      const auth = await authenticateRequest(token || null, client_id || null)
      accountId = auth.client_id
    } else {
      const session = await getStoreSession()
      if (session) {
        accountId = session.accountId
      }
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Não autorizado ou conta não identificada' }, { status: 401 })
    }

    const admin = createAdminClient()

    // 1. Fetch conversation
    const { data: conversation, error: convError } = await admin
      .from('store_conversations')
      .select('id, account_id, store_id, contact_id, commercial_stage')
      .eq('id', conversation_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (convError) throw convError
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // 2. Fetch contact and channel configs
    const [{ data: contact }, { data: channel }] = await Promise.all([
      admin
        .from('store_contacts')
        .select('phone_number, remote_jid')
        .eq('id', conversation.contact_id)
        .maybeSingle(),
      admin
        .from('store_channels')
        .select('evolution_instance_name')
        .eq('account_id', accountId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
    ])

    // Fallback para panel_whatsapp_config legado se nenhum store_channel ativo estiver configurado
    let instanceName = channel?.evolution_instance_name
    if (!instanceName) {
      const { data: whatsappConfig } = await admin
        .from('panel_whatsapp_config')
        .select('evolution_instance_name')
        .eq('client_id', accountId)
        .maybeSingle()
      instanceName = whatsappConfig?.evolution_instance_name
    }

    const recipient = contact?.phone_number

    if (!recipient || !instanceName) {
      return NextResponse.json({ error: 'Configuração de envio Evolution indisponível para a conversa' }, { status: 422 })
    }

    const shouldAutoMove = Boolean(
      auto_move_enabled &&
      typeof auto_move_to_stage === 'string' &&
      RETAIL_STAGES.includes(auto_move_to_stage)
    )

    // Enviar mensagem de texto pelo Evolution API
    const text = content.trim()
    await sendTextMessage(instanceName, recipient, text)

    const now = new Date().toISOString()
    
    // 3. Insert into store_messages
    const { data: message, error: insertError } = await admin
      .from('store_messages')
      .insert({
        id: crypto.randomUUID(),
        account_id: accountId,
        store_id: conversation.store_id || null,
        conversation_id,
        contact_id: conversation.contact_id,
        content: text,
        content_type: 'text',
        sender_type: 'operator',
        from_who: 'human',
        created_at: now,
      })
      .select('id, content, from_who, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    // 4. Update store_conversations timestamps and stage
    const updates: any = {
      last_outgoing_at: now,
      updated_at: now,
    }

    if (shouldAutoMove) {
      const targetStage = auto_move_to_stage as string
      updates.commercial_stage = targetStage
      
      if (targetStage === 'won') {
        updates.won_at = now;
        updates.operational_status = 'resolved';
      } else if (targetStage === 'lost') {
        updates.operational_status = 'resolved';
      } else if (conversation.commercial_stage === 'won' || conversation.commercial_stage === 'lost') {
        updates.operational_status = 'bot_active';
      }
    }

    const { error: updateError } = await admin
      .from('store_conversations')
      .update(updates)
      .eq('id', conversation_id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json(message)
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
