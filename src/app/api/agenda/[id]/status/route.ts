import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'

function normalizeAppointmentStatus(status: string): string {
  return status === 'noshow' ? 'no_show' : status
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

    const validStatuses = ['attended', 'no_show', 'cancelled', 'rescheduled', 'scheduled', 'confirmed']
    if (!normalizedStatus || !validStatuses.includes(normalizedStatus)) {
      return NextResponse.json(
        { error: `Status inválido. Use: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

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
