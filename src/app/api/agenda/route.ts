import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { isAuthError } from '@/lib/auth/request-context'
import { normalizeAgendaStatus } from '@/lib/agenda/constants'
import { createAgendaAppointment, listAgendaAppointments } from '@/lib/agenda/service'

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')

    console.log('[agenda/route] GET start', { requestId, clientId, hasToken: !!token })

    const auth = await authenticateRequest(token, clientId)

    console.log('[agenda/route] auth ok', { requestId, resolvedClientId: auth.client_id, source: auth.source })

    const params = {
      clientId: auth.client_id,
      view: (request.nextUrl.searchParams.get('view') ?? undefined) as 'day' | 'week' | 'month' | 'list' | undefined,
      date: request.nextUrl.searchParams.get('date'),
      dateFrom: request.nextUrl.searchParams.get('date_from'),
      dateTo: request.nextUrl.searchParams.get('date_to'),
      status: request.nextUrl.searchParams.get('status'),
      query: request.nextUrl.searchParams.get('query'),
      contactId: request.nextUrl.searchParams.get('contact_id'),
      page: parsePositiveInt(request.nextUrl.searchParams.get('page'), 1),
      pageSize: parsePositiveInt(request.nextUrl.searchParams.get('page_size'), 50),
    }

    console.log('[agenda/route] calling listAgendaAppointments', { requestId, params })

    const result = await listAgendaAppointments(params)

    console.log('[agenda/route] GET ok', { requestId, total: result.meta.total, items: result.items.length })

    return NextResponse.json(result, {
      headers: {
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      console.error('[agenda/route] auth error', { requestId, status: error.status, message: error.message })
      return NextResponse.json({ error: error.message, errorId: requestId }, { status: error.status })
    }

    // Supabase errors são objetos planos, não instanceof Error
    const isSupabaseError = error !== null && typeof error === 'object' && 'message' in error
    const message = error instanceof Error
      ? error.message
      : isSupabaseError
        ? (error as { message: string }).message
        : String(error)

    console.error('[agenda/route] GET error', {
      requestId,
      message,
      errorType: error instanceof Error ? 'Error' : typeof error,
      errorRaw: JSON.stringify(error),
    })

    return NextResponse.json({ error: message, errorId: requestId }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const body = await request.json()
    const auth = await authenticateRequest(body?.token ?? null, body?.client_id ?? null)
    const status = body?.status ? normalizeAgendaStatus(body.status) : 'scheduled'

    if (!body?.start_at || !body?.end_at) {
      return NextResponse.json(
        { error: 'start_at e end_at são obrigatórios', errorId: requestId },
        { status: 400 }
      )
    }

    const appointment = await createAgendaAppointment({
      clientId: auth.client_id,
      conversationId: body?.conversation_id ?? null,
      contactId: body?.contact_id ?? null,
      contactName: body?.contact_name ?? null,
      contactPhone: body?.contact_phone ?? null,
      title: body?.title ?? null,
      modality: body?.modality ?? null,
      status: status ?? 'scheduled',
      notes: body?.notes ?? null,
      startAt: body.start_at,
      endAt: body.end_at,
      syncToGoogle: body?.sync_to_google ?? true,
      source: body?.source ?? 'supabase',
    })

    return NextResponse.json(appointment, {
      status: 201,
      headers: {
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: error.message, errorId: requestId }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Erro interno'
    console.error('[agenda/route] POST error', { requestId, message })
    return NextResponse.json({ error: message, errorId: requestId }, { status: 500 })
  }
}
