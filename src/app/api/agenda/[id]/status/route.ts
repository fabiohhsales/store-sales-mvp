import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, token, client_id } = body

    const validStatuses = ['attended', 'no_show', 'cancelled', 'rescheduled', 'scheduled']
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status inválido. Use: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('appointments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
