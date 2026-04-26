import { NextRequest, NextResponse } from 'next/server'
import { resolveDeskUser } from '@/lib/desk/auth'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'
import { emitConversationEvent } from '@/lib/desk/emit-conversation-event'
import { sendOperationalFollowupMessage } from '@/lib/followup/shared'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CadenceType } from '@/types/followup'

function isCadenceType(value: unknown): value is CadenceType {
  return value === 'lead' || value === 'atendimento' || value === 'agendado'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const { conversationId } = await params
  const body = await request.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const cadenceType = body?.cadence_type
  const stepKey = typeof body?.step_key === 'string' && body.step_key.trim() ? body.step_key.trim() : null

  if (!message) {
    return NextResponse.json({ error: 'Mensagem obrigatoria' }, { status: 400 })
  }

  if (!isCadenceType(cadenceType)) {
    return NextResponse.json({ error: 'cadence_type invalido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select(`
      id,
      client_id,
      contact_id,
      stage,
      status,
      contacts ( phone_number, identifier ),
      panel_clients!client_id (
        panel_whatsapp_config ( evolution_instance_name )
      )
    `)
    .eq('id', conversationId)
    .maybeSingle()

  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 })
  }

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
  }

  if (!deskUser.isAdmin && conversation.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (conversation.stage === 'resolved' || conversation.status === 'resolved') {
    return NextResponse.json({ error: 'Conversa resolvida nao pode receber follow-up manual' }, { status: 409 })
  }

  const contact = extractFirstContact(conversation)
  const instanceName = extractEvolutionInstanceName(conversation)
  const recipient = contact?.identifier ?? contact?.phone_number

  if (!instanceName) {
    return NextResponse.json({ error: 'Instancia WhatsApp nao configurada' }, { status: 422 })
  }

  if (!recipient) {
    return NextResponse.json({ error: 'Contato sem numero WhatsApp' }, { status: 422 })
  }

  const { evolutionMessageId, sentAt } = await sendOperationalFollowupMessage({
    clientId: conversation.client_id,
    conversationId,
    contactId: conversation.contact_id,
    recipient,
    instanceName,
    cadenceType,
    message,
    stepKey,
  })

  void emitConversationEvent(
    conversationId,
    conversation.client_id,
    'followup_triggered_manual',
    'operator',
    {
      cadence_type: cadenceType,
      step_key: stepKey,
      evolution_message_id: evolutionMessageId,
    },
    deskUser.userId
  )

  return NextResponse.json({
    ok: true,
    evolution_message_id: evolutionMessageId,
    sent_at: sentAt,
  })
}
