// POST /api/desk/conversations/[id]/message
// Operador envia mensagem manual via Evolution API e persiste no Supabase.
// Body: { content: string }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { sendTextMessage } from '@/lib/api/evolution'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const admin = createAdminClient()

  // Carrega conversa + contato + instância Evolution
  const { data: conv } = await admin
    .from('conversations')
    .select(`
      id, client_id, stage, status,
      contacts ( phone_number, identifier ),
      panel_clients!client_id (
        panel_whatsapp_config ( evolution_instance_name )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const contact = extractFirstContact(conv)
  const instanceName = extractEvolutionInstanceName(conv)

  if (!instanceName) {
    return NextResponse.json({ error: 'Instância WhatsApp não configurada' }, { status: 422 })
  }

  const identifier = contact?.identifier ?? contact?.phone_number
  if (!identifier) {
    return NextResponse.json({ error: 'Contato sem número WhatsApp' }, { status: 422 })
  }

  // Política de takeover humano: toda mensagem de operador renova o ai_pause
  // por +24h. O bot só volta a responder via /action?action=return ou /resolve.
  // Sem renovação por mensagem, o lock expirava no meio de uma conversa em
  // andamento e o bot voltava a falar por cima do humano.
  await admin.from('ai_pauses').upsert({
    conversation_id: id,
    paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    paused_reason: 'operator_assumed',
    paused_by: deskUser.userId,
    updated_at: new Date().toISOString(),
  })

  // Auto-assume: a transição de stage só acontece na primeira mensagem.
  if (conv.stage !== 'in_service') {
    await admin.from('conversations').update({
      stage: 'in_service',
      ...(conv.status === 'resolved' ? { status: 'open' } : {}),
    }).eq('id', id)
  }

  // Envia via Evolution API — captura o message ID para rastreamento de entrega
  const evolutionMsgId = await sendTextMessage(instanceName, identifier, content.trim())

  // Persiste no Supabase
  const { data: message, error } = await admin
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: id,
      client_id: conv.client_id,
      content: content.trim(),
      content_type: 'text',
      sender_type: 'operator',
      from_who: 'human',
      evolution_message_id: evolutionMsgId ?? null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[desk/message] insert error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  // Atualiza timestamps da conversa
  await admin.from('conversations').update({
    last_outgoing_at: new Date().toISOString(),
    last_outgoing_by: 'operator',
  }).eq('id', id)

  return NextResponse.json(message)
}
