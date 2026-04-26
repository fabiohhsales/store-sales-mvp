import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CadenceType, FollowupTarget } from '@/types/followup'

type TargetConversationRow = {
  id: string
  contact_id: string | null
  followup_cadence: string | null
  stage: string | null
  contacts: Array<{ name: string | null; phone_number: string | null }> | null
}

function isCadenceType(value: string | null): value is CadenceType {
  return value === 'lead' || value === 'atendimento' || value === 'agendado'
}

function getContact(row: TargetConversationRow) {
  return Array.isArray(row.contacts) ? row.contacts[0] ?? null : null
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')
    const query = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

    const auth = await authenticateRequest(token, clientId)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('conversations')
      .select(`
        id,
        contact_id,
        followup_cadence,
        stage,
        contacts(name, phone_number)
      `)
      .eq('client_id', auth.client_id)
      .or('stage.neq.resolved,stage.is.null')
      .order('last_incoming_at', { ascending: false, nullsFirst: false })
      .limit(200)

    if (error) throw error

    const targets = ((data ?? []) as TargetConversationRow[])
      .map((conversation): FollowupTarget => {
        const contact = getContact(conversation)
        return {
          conversation_id: conversation.id,
          contact_id: conversation.contact_id,
          contact_name: contact?.name ?? 'Sem nome',
          contact_phone: contact?.phone_number ?? '',
          stage: conversation.stage,
          active_cadence: isCadenceType(conversation.followup_cadence)
            ? conversation.followup_cadence
            : null,
        }
      })
      .filter((target) => {
        if (!query) return true
        return (
          target.contact_name.toLowerCase().includes(query) ||
          target.contact_phone.toLowerCase().includes(query)
        )
      })
      .slice(0, 20)

    return NextResponse.json(targets, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message, errorId: requestId }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Erro interno'
    console.error('[followups/targets] Error', { requestId, message })
    return NextResponse.json({ error: message, errorId: requestId }, { status: 500 })
  }
}
