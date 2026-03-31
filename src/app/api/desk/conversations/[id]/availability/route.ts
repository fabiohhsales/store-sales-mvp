import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { getCalendarClient } from '@/lib/calendar/client'
import { parseTimeWindow, getAvailableSlots, formatSlotsMessage } from '@/lib/calendar/slots'
import { sendTextMessage } from '@/lib/api/evolution'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const hint = typeof body?.time_window_hint === 'string' ? body.time_window_hint : null

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversations')
    .select(`
      id, client_id,
      contacts ( phone_number, identifier, name ),
      panel_clients!client_id (
        panel_google_config ( calendar_id ),
        panel_whatsapp_config ( evolution_instance_name ),
        panel_bot_config ( professional_name, ai_language, working_hours, appointment_duration_default, appointment_buffer_minutes, min_advance_booking_hours )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const containerRaw = (conv as Record<string, unknown>)?.panel_clients as Record<string, unknown> | Record<string, unknown>[] | null
  const container = Array.isArray(containerRaw) ? containerRaw[0] ?? null : containerRaw
  const googleRaw = container?.panel_google_config as Record<string, unknown> | Record<string, unknown>[] | null
  const whatsappRaw = container?.panel_whatsapp_config as Record<string, unknown> | Record<string, unknown>[] | null
  const botRaw = container?.panel_bot_config as Record<string, unknown> | Record<string, unknown>[] | null
  const google = Array.isArray(googleRaw) ? googleRaw[0] ?? null : googleRaw
  const whatsapp = Array.isArray(whatsappRaw) ? whatsappRaw[0] ?? null : whatsappRaw
  const bot = Array.isArray(botRaw) ? botRaw[0] ?? null : botRaw
  const contactRaw = conv.contacts as { phone_number: string | null; identifier: string | null; name?: string | null } | { phone_number: string | null; identifier: string | null; name?: string | null }[] | null
  const contact = Array.isArray(contactRaw) ? contactRaw[0] ?? null : contactRaw

  const calendarId = (google?.calendar_id as string | null) ?? null
  const instanceName = (whatsapp?.evolution_instance_name as string | null) ?? null
  if (!calendarId || !instanceName) {
    return NextResponse.json({ error: 'Calendar/WhatsApp não configurados para este cliente' }, { status: 422 })
  }

  const identifier = contact?.identifier ?? contact?.phone_number
  if (!identifier) return NextResponse.json({ error: 'Contato sem telefone/identifier' }, { status: 422 })

  try {
    const workingHours = (bot?.working_hours as Record<string, unknown>) ?? {}
    const duration = Number(bot?.appointment_duration_default ?? 60)
    const buffer = Number(bot?.appointment_buffer_minutes ?? 15)
    const minAdvance = Number(bot?.min_advance_booking_hours ?? 2)
    const language = (bot?.ai_language as string | null) ?? 'pt-BR'
    const professional = (bot?.professional_name as string | null) ?? 'profissional'

    const range = await parseTimeWindow(hint)
    const calendar = getCalendarClient()
    const slots = await getAvailableSlots(
      calendar,
      calendarId,
      range,
      workingHours as never,
      duration,
      buffer,
      6,
      language,
      minAdvance
    )

    const message = formatSlotsMessage(slots, professional, language)
    await sendTextMessage(instanceName, identifier, message)

    await admin.from('messages').insert({
      id: crypto.randomUUID(),
      conversation_id: id,
      client_id: conv.client_id,
      content: message,
      content_type: 'text',
      sender_type: 'agent_bot',
      from_who: 'ai',
      created_at: new Date().toISOString(),
    })

    await admin.from('conversations').update({
      last_outgoing_at: new Date().toISOString(),
      last_outgoing_by: 'operator',
    }).eq('id', id)

    return NextResponse.json({ ok: true, slots: slots.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar disponibilidades'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
