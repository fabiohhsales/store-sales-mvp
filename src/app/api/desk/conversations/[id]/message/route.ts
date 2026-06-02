// POST /api/desk/conversations/[id]/message
// Operador envia mensagem manual via Evolution API e persiste no Supabase para o Desk (Store Sales).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'
import { RATE_LIMITS } from '@/lib/desk/rate-limit'
import { sendTextMessage } from '@/lib/api/evolution'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, RATE_LIMITS.send)
  if (blocked) return blocked

  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Carrega conversa da nova tabela
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

  // 2. Carrega contato e canais
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

  // Fallback para panel_whatsapp_config legado se nenhum store_channel ativo estiver configurado
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

  // Auto-assume para takeover humano se não estiver em atendimento
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

  // Envia via Evolution API
  const evolutionMsgId = await sendTextMessage(instanceName, recipient, content.trim())

  // Persiste no Supabase (store_messages)
  const { data: message, error } = await admin
    .from('store_messages')
    .insert({
      id: crypto.randomUUID(),
      account_id: conv.account_id,
      store_id: conv.store_id || null,
      conversation_id: id,
      contact_id: conv.contact_id,
      content: content.trim(),
      content_type: 'text',
      sender_type: 'operator',
      from_who: 'human',
      evolution_message_id: evolutionMsgId ?? null,
      created_at: now,
    })
    .select()
    .single()

  if (error) {
    console.error('[desk/message] insert error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  // Atualiza timestamps da conversa
  await admin
    .from('store_conversations')
    .update({
      last_outgoing_at: now,
      updated_at: now,
    })
    .eq('id', id)

  // Mapeia para compatibilidade
  const mappedMessage = {
    ...message,
    derived_text: null,
    derived_kind: null,
    processing_status: 'ready',
    processing_error: null,
  }

  return NextResponse.json(mappedMessage)
}
