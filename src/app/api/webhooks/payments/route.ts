import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'
import { emitConversationEvent } from '@/lib/desk/emit-conversation-event'

/**
 * Handles Payment Gateway webhooks (Stripe, AbacatePay, and developer Mock sandbox).
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  let providerPaymentId: string | null = null
  let orderId: string | null = null
  let providerType: 'stripe' | 'abacatepay' = 'stripe'

  try {
    const rawBody = await req.text()
    const headers = req.headers

    // 1. Detect Provider (Stripe vs AbacatePay)
    const stripeSignature = headers.get('stripe-signature')
    
    if (stripeSignature) {
      providerType = 'stripe'
      const payload = JSON.parse(rawBody)
      
      // Stripe checkout event
      if (payload.type === 'checkout.session.completed') {
        providerPaymentId = payload.data.object.id
        orderId = payload.data.object.client_reference_id
      }
    } else {
      // Assume AbacatePay
      providerType = 'abacatepay'
      const payload = JSON.parse(rawBody)
      
      // AbacatePay billing event status
      if (payload.event === 'billing.paid') {
        providerPaymentId = payload.data.id
        // metadata ou ID do produto
        orderId = payload.data.products?.[0]?.externalId || null
      }
    }

    if (!providerPaymentId && !orderId) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // 2. Process payment success in DB
    const success = await processPaymentSuccess(orderId, providerPaymentId, providerType)
    if (!success) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Payment-Webhook] Falha no processamento do webhook:', error)
    return NextResponse.json({ error: 'Erro de processamento' }, { status: 500 })
  }
}

/**
 * GET Handler for developer Mock simulation checkout.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const provider = searchParams.get('provider')
  const orderId = searchParams.get('order_id')
  const mockId = searchParams.get('id')

  if (provider === 'mock' && orderId && mockId) {
    console.log(`[Payment-Webhook-Mock] Simulando pagamento aprovado para order=${orderId}`)
    
    const success = await processPaymentSuccess(orderId, mockId, 'mock')
    if (success) {
      return new NextResponse(
        `<html>
          <head><title>Pagamento Simulado com Sucesso!</title></head>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 50px;">
            <div style="max-width: 500px; margin: auto; background: #1e293b; padding: 40px; border-radius: 12px; border: 1px solid #22c55e;">
              <h1 style="color: #22c55e;">✓ Pagamento Confirmado</h1>
              <p>Simulador de desenvolvimento Chat Sales</p>
              <p style="color: #94a3b8; font-size: 14px;">Order ID: ${orderId}</p>
              <p style="color: #94a3b8; font-size: 14px;">Mock TxID: ${mockId}</p>
              <hr style="border-color: #334155; margin: 20px 0;"/>
              <p>O robô da loja já foi notificado e enviou a mensagem de confirmação no WhatsApp!</p>
              <button onclick="window.close()" style="background: #22c55e; border: none; padding: 10px 20px; color: white; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 10px;">Fechar Janela</button>
            </div>
          </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }
    
    return new NextResponse('Pedido não encontrado para simulação.', { status: 404 })
  }

  return new NextResponse('Metodo nao permitido', { status: 405 })
}

/**
 * Updates order status, logs client notifications, and dispatches confirmation WhatsApp alert.
 */
async function processPaymentSuccess(
  orderId: string | null,
  providerPaymentId: string,
  providerType: string
): Promise<boolean> {
  const supabase = createAdminClient()

  // 1. Find Order
  let query = supabase.from('store_orders').select('*')
  if (orderId) {
    query = query.eq('id', orderId)
  } else {
    query = query.eq('provider_payment_id', providerPaymentId)
  }

  const { data: order } = await query.maybeSingle()
  if (!order) {
    console.warn(`[Payment-Webhook] Pedido nao encontrado: orderId=${orderId} txId=${providerPaymentId}`)
    return false
  }

  if (order.status === 'paid') {
    console.log(`[Payment-Webhook] Pedido ${order.id} ja esta marcado como pago.`)
    return true
  }

  // 2. Update status in database
  const { error: updateErr } = await supabase
    .from('store_orders')
    .update({
      status: 'paid',
      provider_payment_id: providerPaymentId,
      payment_provider: providerType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)

  if (updateErr) {
    console.error(`[Payment-Webhook] Erro ao atualizar status do pedido ${order.id}:`, updateErr.message)
    return false
  }

  console.log(`[Payment-Webhook] Pedido ${order.id} atualizado para status=paid!`)

  // 3. Emit Conduction/Conversation Event
  if (order.conversation_id) {
    emitConversationEvent(
      order.conversation_id,
      order.client_id,
      'payment_received',
      'system',
      {
        order_id: order.id,
        amount: order.total_amount,
        provider: providerType,
        payment_id: providerPaymentId,
      }
    )
  }

  // 4. Fetch Contact and WhatsApp Config to send WhatsApp alert
  const { data: contact } = await supabase
    .from('contacts')
    .select('identifier, phone_number')
    .eq('id', order.contact_id)
    .maybeSingle()

  const { data: wConfig } = await supabase
    .from('panel_whatsapp_config')
    .select('evolution_instance_name')
    .eq('client_id', order.client_id)
    .maybeSingle()

  if (contact && wConfig?.evolution_instance_name) {
    const recipient = contact.identifier || contact.phone_number
    if (recipient) {
      const confirmMessage = `Obrigado! Identificamos o seu pagamento de *R$ ${Number(order.total_amount).toFixed(2)}*. 💳\nJá estamos preparando o seu pedido e em breve nossa equipe entrará em contato para agendar a entrega!`
      try {
        await sendTextMessage(wConfig.evolution_instance_name, recipient, confirmMessage)
        
        // Save confirmation message in conversation history
        if (order.conversation_id) {
          await supabase.from('messages').insert({
            id: crypto.randomUUID(),
            conversation_id: order.conversation_id,
            client_id: order.client_id,
            content: confirmMessage,
            content_type: 'text',
            sender_type: 'agent_bot',
            from_who: 'ai',
            created_at: new Date().toISOString(),
          })
        }
      } catch (waErr) {
        console.error(`[Payment-Webhook] Falha ao enviar WhatsApp de confirmacao para o cliente:`, waErr)
      }
    }
  }

  return true
}
