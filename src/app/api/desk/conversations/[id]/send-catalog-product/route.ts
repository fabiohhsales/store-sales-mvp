import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'
import { RATE_LIMITS } from '@/lib/desk/rate-limit'
import { sendTextMessage, sendMediaByUrl } from '@/lib/api/evolution'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, RATE_LIMITS.send)
  if (blocked) return blocked

  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { productId } = await request.json()
  if (!productId) return NextResponse.json({ error: 'ID de produto obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Fetch conversation
  const { data: conv, error: convError } = await admin
    .from('store_conversations')
    .select('id, account_id, store_id, contact_id, operational_status')
    .eq('id', id)
    .maybeSingle()

  if (convError) throw convError
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.account_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // 2. Fetch product details
  const { data: product, error: prodError } = await admin
    .from('store_products')
    .select('*')
    .eq('id', productId)
    .maybeSingle()

  if (prodError) throw prodError
  if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  // 3. Fetch contact and channel details
  const [{ data: contact }, { data: channel }] = await Promise.all([
    admin
      .from('store_contacts')
      .select('phone_number, remote_jid')
      .eq('id', conv.contact_id)
      .maybeSingle(),
    admin
      .from('store_channels')
      .select('evolution_instance_name')
      .eq('account_id', conv.account_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  ])

  let instanceName = channel?.evolution_instance_name
  if (!instanceName) {
    const { data: whatsappConfig } = await admin
      .from('panel_whatsapp_config')
      .select('evolution_instance_name')
      .eq('client_id', conv.account_id)
      .maybeSingle()
    instanceName = whatsappConfig?.evolution_instance_name
  }

  const recipient = contact?.phone_number
  if (!recipient || !instanceName) {
    return NextResponse.json({ error: 'Instância WhatsApp ou Contato indisponível para envio' }, { status: 422 })
  }

  const now = new Date().toISOString()

  // Auto-assume takeover
  if (conv.operational_status !== 'in_service') {
    await admin
      .from('store_conversations')
      .update({
        operational_status: 'in_service',
        assigned_user_id: deskUser.userId,
        updated_at: now,
      })
      .eq('id', id)
  }

  // 4. Construct product card text message
  const priceFormatted = product.price_amount
    ? `R$ ${Number(product.price_amount).toFixed(2)}`
    : 'Preço sob consulta'

  const messageText = `*${product.name}*\n\n` +
    `${product.description_short || ''}\n\n` +
    `💵 Preço: *${priceFormatted}*\n` +
    `${product.sku ? `📦 SKU: ${product.sku}\n` : ''}` +
    `${product.delivery_available ? '🚚 Pronta entrega/entrega disponível\n' : ''}` +
    `${product.source_url ? `🔗 Link: ${product.source_url}\n` : ''}`

  let evolutionMsgId: string | null = null

  // 5. Send message (with image if present)
  // Check image url
  let isMediaSent = false
  const imageUrl = product.main_image_url
  if (imageUrl) {
    try {
      // Determine file extension and mime type from image path
      const ext = imageUrl.split('.').pop()?.toLowerCase() || 'jpg'
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
      
      evolutionMsgId = await sendMediaByUrl(
        instanceName,
        recipient,
        'image',
        mime,
        imageUrl,
        messageText
      )
      isMediaSent = true
    } catch (mediaErr) {
      console.error('[send-catalog-product] Fallback to text because media failed:', mediaErr)
    }
  }

  if (!isMediaSent) {
    evolutionMsgId = await sendTextMessage(instanceName, recipient, messageText)
  }

  // 6. Log message in store_messages
  const { data: message, error } = await admin
    .from('store_messages')
    .insert({
      id: crypto.randomUUID(),
      account_id: conv.account_id,
      store_id: conv.store_id || null,
      conversation_id: id,
      contact_id: conv.contact_id,
      content: messageText,
      content_type: 'text',
      sender_type: 'operator',
      from_who: 'human',
      evolution_message_id: evolutionMsgId ?? null,
      media_url: imageUrl || null,
      media_mime_type: imageUrl ? 'image/jpeg' : null,
      created_at: now,
    })
    .select()
    .single()

  if (error) {
    console.error('[send-catalog-product] insert store_messages error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  // 7. Update conversation records
  await admin
    .from('store_conversations')
    .update({
      last_outgoing_at: now,
      updated_at: now,
    })
    .eq('id', id)

  return NextResponse.json({ success: true, message })
}
