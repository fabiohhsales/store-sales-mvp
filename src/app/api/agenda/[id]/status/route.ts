import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { isAgendaStatus, normalizeAgendaStatus } from '@/lib/agenda/constants'
import { updateAgendaAppointmentStatus } from '@/lib/agenda/service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID()

  try {
    const { id } = await params
    const body = await request.json()
    const normalizedStatus = normalizeAgendaStatus(body?.status)

    if (!isAgendaStatus(normalizedStatus)) {
      return NextResponse.json(
        { error: 'Status inválido. Use: scheduled, confirmed, attended, noshow, cancelled ou rescheduled' },
        { status: 400 }
      )
    }

    const auth = await authenticateRequest(body?.token ?? null, body?.client_id ?? null)
    const data = await updateAgendaAppointmentStatus(id, auth.client_id, normalizedStatus)

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
    const status = message.includes('não encontrado') ? 404 : 500
    console.error('[agenda/status] Error response', { requestId, status, message })
    return NextResponse.json({ error: message, errorId: requestId }, { status })
  }
}
