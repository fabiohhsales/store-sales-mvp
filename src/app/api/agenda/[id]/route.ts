import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { normalizeAgendaStatus } from '@/lib/agenda/constants'
import { cancelAgendaAppointment, updateAgendaAppointment } from '@/lib/agenda/service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID()

  try {
    const { id } = await params
    const body = await request.json()
    const auth = await authenticateRequest(body?.token ?? null, body?.client_id ?? null)

    const appointment = await updateAgendaAppointment(id, auth.client_id, {
      title: body?.title ?? undefined,
      modality: body?.modality ?? undefined,
      status: body?.status ? normalizeAgendaStatus(body.status) ?? undefined : undefined,
      notes: body?.notes ?? undefined,
      startAt: body?.start_at ?? undefined,
      endAt: body?.end_at ?? undefined,
      contactName: body?.contact_name ?? undefined,
      contactPhone: body?.contact_phone ?? undefined,
      syncToGoogle: body?.sync_to_google,
    })

    return NextResponse.json(appointment, {
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
    console.error('[agenda/[id]] PATCH error', { requestId, message })
    return NextResponse.json({ error: message, errorId: requestId }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID()

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const token = request.nextUrl.searchParams.get('token') ?? body?.token ?? null
    const clientId = request.nextUrl.searchParams.get('client_id') ?? body?.client_id ?? null
    const auth = await authenticateRequest(token, clientId)
    const appointment = await cancelAgendaAppointment(id, auth.client_id)

    return NextResponse.json(appointment, {
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
    console.error('[agenda/[id]] DELETE error', { requestId, message })
    return NextResponse.json({ error: message, errorId: requestId }, { status })
  }
}
