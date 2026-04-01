import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { createAdminClient } from '@/lib/supabase/admin'

function normalizeAppointmentStatus(status: string): string {
  return status === 'no_show' ? 'noshow' : status
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID()
  try {
    const { id } = await params
    const body = await request.json()
    const { status, token, client_id } = body
    const normalizedStatus = normalizeAppointmentStatus(status)

    const validStatuses = ['attended', 'noshow', 'cancelled', 'rescheduled', 'scheduled', 'confirmed']
    if (!normalizedStatus || !validStatuses.includes(normalizedStatus)) {
      return NextResponse.json(
        { error: `Status inválido. Use: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const auth = await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

    const { data: ownedAppointment, error: ownershipError } = await admin
      .from('appointments')
      .select('id, conversations!inner(client_id)')
      .eq('id', id)
      .eq('conversations.client_id', auth.client_id)
      .maybeSingle()

    if (ownershipError) throw ownershipError

    if (!ownedAppointment) {
      const { data: existing, error: existsError } = await admin
        .from('appointments')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      if (existsError) throw existsError
      if (!existing) {
        return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Acesso negado para este agendamento' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('appointments')
      .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) throw error

    return NextResponse.json(data, {
      headers: {
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message, errorId: requestId }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    console.error('[agenda/status] Error response', {
      requestId,
      status,
      message,
    })
    return NextResponse.json({ error: message, errorId: requestId }, { status })
  }
}
