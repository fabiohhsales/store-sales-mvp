import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { createCheckoutSession } from '@/lib/payments/client'
import type { StoreAgentOutput } from './store-agent'
import type { StorePipelineResult } from '@/types/store'

async function saveAiMessage(
  conversationId: string,
  clientId: string,
  reply: string
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('messages').insert({
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    client_id: clientId,
    content: reply,
    content_type: 'text',
    sender_type: 'agent_bot',
    from_who: 'ai',
    created_at: new Date().toISOString(),
  })
  if (error) {
    console.error(`[Store-Dispatcher] Falha ao salvar mensagem da IA na conversa ${conversationId}: ${error.message}`)
  }
}

async function handleHandoff(
  result: StorePipelineResult,
  output: StoreAgentOutput,
  handoffMessage: string | null
): Promise<void> {
  const supabase = createAdminClient()
  const { storeContext, contact, conversation } = result
  const { whatsappConfig, storeSettings } = storeContext

  const messageToSend = handoffMessage
    || storeSettings.fallback_message
    || 'Vou te transferir para um vendedor. Um momento, por favor.'

  const identifier = contact.identifier ?? contact.phone_number
  if (identifier && whatsappConfig.evolution_instance_name) {
    try {
      await sendTextMessage(whatsappConfig.evolution_instance_name, identifier, messageToSend)
    } catch (err) {
      console.error('[Store-Dispatcher] Falha ao enviar mensagem de handoff:', err)
    }
  }

  // Update conversation stage
  await supabase
    .from('conversations')
    .update({
      stage: 'awaiting_human',
      handoff_reason_code: output.handoff.reason || 'store_agent_handoff',
      handoff_reason_label: 'Transferido da Loja',
      handoff_transferred_at: new Date().toISOString(),
      summary: `Cliente solicitou atendimento ou precisa de suporte comercial (Motivo: ${output.handoff.reason}).`,
    })
    .eq('id', conversation.id)

  await saveAiMessage(conversation.id, storeContext.clientId, messageToSend)
  console.log(`[Store-Dispatcher] Handoff conv=${conversation.id} -> awaiting_human`)
}

async function handlePaymentCreate(
  result: StorePipelineResult,
  productId: string,
  quantity: number
): Promise<void> {
  const supabase = createAdminClient()
  const { storeContext, contact, conversation } = result
  const { whatsappConfig } = storeContext

  // 1. Fetch product price
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('name, price_amount')
    .eq('id', productId)
    .maybeSingle()

  if (prodErr || !product || !product.price_amount) {
    console.error(`[Store-Dispatcher] Produto ${productId} não encontrado ou sem preço.`)
    await handleHandoff(result, {
      reply: null,
      status_next: 'open',
      labels_next: ['etapa_triagem'],
      handoff: { needs_human: true, reason: 'product_price_not_found' },
      actions: { payment_create: { should_create: false, product_id: null, quantity: 1 } },
      debug: { detected_intent: 'comprar', notes: 'product_missing_price' }
    }, 'Vou chamar um vendedor para te ajudar com o preço e a finalização da compra.')
    return
  }

  const priceAmount = Number(product.price_amount)
  const totalAmount = priceAmount * quantity

  // 2. Create Order & Items in DB
  const { data: order, error: orderErr } = await supabase
    .from('store_orders')
    .insert({
      id: crypto.randomUUID(),
      client_id: storeContext.clientId,
      store_id: storeContext.storeId,
      contact_id: contact.id,
      conversation_id: conversation.id,
      status: 'pending',
      total_amount: totalAmount,
    })
    .select()
    .single()

  if (orderErr) {
    console.error('[Store-Dispatcher] Erro ao criar ordem:', orderErr.message)
    return
  }

  await supabase.from('store_order_items').insert({
    id: crypto.randomUUID(),
    order_id: order.id,
    product_id: productId,
    quantity,
    price_amount: priceAmount,
  })

  // 3. Create Stripe / AbacatePay Checkout Session
  try {
    const session = await createCheckoutSession(
      storeContext.clientId,
      storeContext.storeId,
      order.id,
      totalAmount,
      `Compra de ${quantity}x ${product.name}`
    )

    // Update order with checkout links
    await supabase
      .from('store_orders')
      .update({
        payment_url: session.url,
        provider_payment_id: session.id,
        payment_provider: session.provider,
      })
      .eq('id', order.id)

    // 4. Send checkout link to customer via WhatsApp
    const checkoutMessage = `Excelente escolha! Para concluir a compra do *${product.name}* no valor de *R$ ${totalAmount.toFixed(2)}*, basta efetuar o pagamento neste link seguro (Pix ou Cartão):\n\n${session.url}`
    const identifier = contact.identifier ?? contact.phone_number

    if (identifier && whatsappConfig.evolution_instance_name) {
      await sendTextMessage(whatsappConfig.evolution_instance_name, identifier, checkoutMessage)
      await saveAiMessage(conversation.id, storeContext.clientId, checkoutMessage)
    }

    console.log(`[Store-Dispatcher] Link de pagamento enviado para conv=${conversation.id} url=${session.url}`)
  } catch (err) {
    console.error('[Store-Dispatcher] Falha ao gerar checkout:', err)
    await handleHandoff(result, {
      reply: null,
      status_next: 'open',
      labels_next: ['etapa_triagem'],
      handoff: { needs_human: true, reason: 'checkout_generation_failed' },
      actions: { payment_create: { should_create: false, product_id: null, quantity: 1 } },
      debug: { detected_intent: 'comprar', notes: 'checkout_error' }
    }, 'Desculpe, tive um probleminha para gerar o seu link de pagamento. Vou transferir para nossa equipe finalizar com você.')
  }
}

async function updateConversationRecord(
  conversationId: string,
  output: StoreAgentOutput
): Promise<void> {
  const supabase = createAdminClient()
  const updates: Record<string, any> = {
    status: output.status_next,
    labels: output.labels_next,
    last_outgoing_at: output.reply ? new Date().toISOString() : undefined,
    last_outgoing_by: output.reply ? 'ai' : undefined,
    last_intent: output.debug.detected_intent || undefined,
  }

  // Remove undefined fields
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete updates[key]
  }

  await supabase.from('conversations').update(updates).eq('id', conversationId)
}

async function clearAiPause(conversationId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('ai_pauses').delete().eq('conversation_id', conversationId)
}

/**
 * Dispatches the AI Agent decisions for the store module:
 * Sends text, handles handoffs, triggers payments, updates DB records.
 */
export async function dispatchStoreAgent(
  result: StorePipelineResult,
  output: StoreAgentOutput
): Promise<void> {
  const { storeContext, contact, conversation } = result
  const { whatsappConfig } = storeContext

  // 1. Text response if not handoff and no payment
  if (output.reply && !output.handoff.needs_human && !output.actions.payment_create.should_create) {
    const identifier = contact.identifier ?? contact.phone_number
    if (identifier && whatsappConfig.evolution_instance_name) {
      try {
        await sendTextMessage(whatsappConfig.evolution_instance_name, identifier, output.reply)
        await saveAiMessage(conversation.id, storeContext.clientId, output.reply)
      } catch (err) {
        console.error('[Store-Dispatcher] Falha ao enviar WhatsApp:', err)
      }
    }
  }

  // 2. Action: Create Payment checkout Link
  if (output.actions.payment_create.should_create && output.actions.payment_create.product_id) {
    await handlePaymentCreate(
      result,
      output.actions.payment_create.product_id,
      output.actions.payment_create.quantity
    )
  }

  // 3. Handoff to human
  if (output.handoff.needs_human && conversation.stage === 'bot_triage') {
    await handleHandoff(result, output, output.reply)
  }

  // 4. Update Conversation state in DB
  await updateConversationRecord(conversation.id, output)

  // 5. Release AI Pause lock
  if (output.debug?.notes !== 'ai_paused') {
    await clearAiPause(conversation.id)
  }
}
