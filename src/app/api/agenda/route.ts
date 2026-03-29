import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const statusFilter = request.nextUrl.searchParams.get('status')

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
        contacts!inner(name, phone_number),
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
      query = query.eq('status', statusFilter)
    }

    const { data: appointments, error } = await query
      .order('start_at', { ascending: true })

    if (error) throw error

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
        status: apt.status,
        meet_link: apt.meet_link,
        google_event_id: apt.google_event_id,
        confirmation_sent_at: apt.confirmation_sent_at,
        confirmation_response: apt.confirmation_response,
        created_at: apt.created_at,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
