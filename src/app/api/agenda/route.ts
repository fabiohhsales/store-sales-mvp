import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'

function normalizeAppointmentStatus(status: string | null | undefined): string | null {
  if (!status) return null
  return status === 'no_show' ? 'noshow' : status
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const rawStatusFilter = request.nextUrl.searchParams.get('status')
    const statusFilter = normalizeAppointmentStatus(rawStatusFilter)

    const auth = await authenticateRequest(token, clientId)
    const admin = createAdminClient()

    // Query appointments via conversations.client_id (novo modelo, sem depender do Chatwoot)
    let query = admin
      .from('appointments')
      .select(`
        id, conversation_id, contact_id, title,
        start_at, end_at, modality, status, meet_link,
        google_event_id, confirmation_sent_at, confirmation_response,
        created_at,
        contacts(name, phone_number),
        conversations!inner(client_id)
      `)
      .eq('conversations.client_id', auth.client_id)

    if (dateFrom) {
      query = query.gte('start_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('start_at', `${dateTo}T23:59:59`)
    }
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'noshow') {
        query = query.in('status', ['no_show', 'noshow'])
      } else {
        query = query.eq('status', statusFilter)
      }
    }

    const { data: appointments, error } = await query
      .order('start_at', { ascending: true })

    if (error) {
      console.error('[agenda/route] Supabase error:', {
        requestId,
        error,
        clientId: auth.client_id,
        dateFrom,
        dateTo,
        statusFilter,
      })
      throw error
    }

    if (!appointments || appointments.length === 0) {
      console.warn('[agenda/route] No appointments returned', {
        requestId,
        clientId: auth.client_id,
        dateFrom,
        dateTo,
        statusFilter,
      })
    }

    const result = (appointments || []).map((apt: Record<string, unknown>) => {
      const contact = apt.contacts as Record<string, unknown> | null
      return {
        id: apt.id,
        conversation_id: apt.conversation_id,
        contact_name: contact?.name || null,
        contact_phone: contact?.phone_number || null,
        title: apt.title,
        start_at: apt.start_at,
        end_at: apt.end_at,
        modality: apt.modality,
        status: normalizeAppointmentStatus((apt.status as string) || null),
        meet_link: apt.meet_link,
        google_event_id: apt.google_event_id,
        confirmation_sent_at: apt.confirmation_sent_at,
        confirmation_response: apt.confirmation_response,
        created_at: apt.created_at,
      }
    })

    const durationMs = Date.now() - startedAt
    console.log('[agenda/route] Success', {
      requestId,
      clientId: auth.client_id,
      count: result.length,
      durationMs,
    })

    return NextResponse.json(result, {
      headers: {
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    console.error('[agenda/route] Error response', {
      requestId,
      status,
      message,
    })
    return NextResponse.json({ error: message, errorId: requestId }, { status })
  }
}
