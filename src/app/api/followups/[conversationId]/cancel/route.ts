import { NextRequest, NextResponse } from 'next/server'
import { resolveDeskUser } from '@/lib/desk/auth'
import { emitConversationEvent } from '@/lib/desk/emit-conversation-event'
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
  const cadenceType = body?.cadence_type

  if (!isCadenceType(cadenceType)) {
    return NextResponse.json({ error: 'cadence_type invalido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id, client_id, contact_id, followup_cadence')
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

  const { data: existingSuppression, error: suppressionLookupError } = await admin
    .from('followup_cadence_suppressions')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('client_id', conversation.client_id)
    .eq('cadence_type', cadenceType)
    .is('released_at', null)
    .maybeSingle()

  if (suppressionLookupError) {
    return NextResponse.json({ error: suppressionLookupError.message }, { status: 500 })
  }

  if (!existingSuppression) {
    const { error: insertSuppressionError } = await admin
      .from('followup_cadence_suppressions')
      .insert({
        conversation_id: conversationId,
        client_id: conversation.client_id,
        cadence_type: cadenceType,
        suppressed_by: deskUser.userId,
        reason: 'manual_cancel',
      })

    if (insertSuppressionError) {
      return NextResponse.json({ error: insertSuppressionError.message }, { status: 500 })
    }

    await admin.from('followup_logs').insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      contact_id: conversation.contact_id,
      workflow_name: 'panel_followup',
      step_name: 'manual_cancel',
      message_sent: null,
      sent_at: new Date().toISOString(),
    })

    void emitConversationEvent(
      conversationId,
      conversation.client_id,
      'followup_cancelled',
      'operator',
      { cadence_type: cadenceType },
      deskUser.userId
    )
  }

  if (conversation.followup_cadence === cadenceType) {
    await admin
      .from('conversations')
      .update({ followup_cadence: null })
      .eq('id', conversationId)
  }

  return NextResponse.json({
    ok: true,
    suppressed: true,
    already_suppressed: !!existingSuppression,
  })
}
