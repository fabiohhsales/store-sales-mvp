import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { sendTextMessage } from '@/lib/api/evolution'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'

/**
 * POST /api/conversations/start
 * Cria uma nova conversa e envia a primeira mensagem via WhatsApp.
 * Body: { phone: string, message: string }
 */
export async function POST(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!deskUser.clientId) return NextResponse.json({ error: 'Nenhum cliente vinculado' }, { status: 400 })

  const { phone, message } = await request.json()
  if (!phone?.trim()) return NextResponse.json({ error: 'Telefone obrigatório' }, { status: 400 })
  if (!message?.trim()) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 })

  const admin = createAdminClient()

  // Busca instância Evolution do cliente
  const { data: whatsappConfig } = await admin
    .from('panel_whatsapp_config')
    .select('evolution_instance_name')
    .eq('client_id', deskUser.clientId)
    .maybeSingle()

  if (!whatsappConfig?.evolution_instance_name) {
    return NextResponse.json({ error: 'Instância WhatsApp não configurada para este cliente' }, { status: 422 })
  }

  const instanceName = whatsappConfig.evolution_instance_name
  const cleanPhone = phone.replace(/\D/g, '')

  // Formata o identifier para o Evolution API (padrão brasileiro)
  const identifier = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`

  // Upsert contato
  const { data: existingContact } = await admin
    .from('contacts')
    .select('id')
    .eq('phone_number', cleanPhone)
    .eq('client_id', deskUser.clientId)
    .maybeSingle()

  let contactId: string
  if (existingContact) {
    contactId = existingContact.id
  } else {
    const { data: newContact, error: contactError } = await admin
      .from('contacts')
      .insert({
        id: crypto.randomUUID(),
        phone_number: cleanPhone,
        identifier,
        client_id: deskUser.clientId,
        name: cleanPhone,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (contactError) return NextResponse.json({ error: `Erro ao criar contato: ${contactError.message}` }, { status: 500 })
    contactId = newContact.id
  }

  // Cria conversa
  const conversationId = crypto.randomUUID()
  const now = new Date().toISOString()

  // Busca stage_labels do bot config para posicionar no funil via labels
  const { data: botConfigRow } = await admin
    .from('panel_bot_config')
    .select('stage_labels')
    .eq('client_id', deskUser.clientId)
    .maybeSingle()
  const stageLabels = sanitizeStageLabels(botConfigRow?.stage_labels)
  const defaultFunnelLabel = stageLabels[0]?.slug ?? null

  const { error: convError } = await admin
    .from('conversations')
    .insert({
      id: conversationId,
      contact_id: contactId,
      client_id: deskUser.clientId,
      status: 'open',
      // stage permanece operacional para o Desk; o funil do Kanban vive em labels[].
      stage: 'in_service',
      assigned_operator_id: deskUser.userId,
      labels: defaultFunnelLabel ? [defaultFunnelLabel] : [],
      last_outgoing_at: now,
      last_outgoing_by: 'operator',
    })

  if (convError) return NextResponse.json({ error: `Erro ao criar conversa: ${convError.message}` }, { status: 500 })

  // Cria ai_pause para manter o bot desligado nesta conversa
  await admin
    .from('ai_pauses')
    .upsert({
      conversation_id: conversationId,
      paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      paused_reason: 'operator_started_conversation',
      paused_by: deskUser.userId,
      updated_at: now,
      client_id: deskUser.clientId,
    })

  // Envia mensagem via Evolution API
  try {
    await sendTextMessage(instanceName, identifier, message.trim())
  } catch (err) {
    // Reverter se falhar o envio
    await admin.from('conversations').delete().eq('id', conversationId)
    const errMsg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Erro ao enviar mensagem: ${errMsg}` }, { status: 500 })
  }

  // Persiste mensagem
  await admin
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      client_id: deskUser.clientId,
      content: message.trim(),
      content_type: 'text',
      sender_type: 'operator',
      from_who: 'human',
      created_at: now,
    })

  return NextResponse.json({
    conversation_id: conversationId,
    contact_id: contactId,
    message: 'Conversa criada e mensagem enviada com sucesso',
  })
}
