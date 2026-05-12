// GET /api/desk/conversations/[id]/activity
// Retorna feed unificado de atividades da conversa (stage events, follow-up, agendamentos, notas).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { EVENT_TYPE_LABELS } from '@/lib/desk/conduction'

export interface ActivityItem {
  id: string
  type: 'stage' | 'followup' | 'appointment' | 'note'
  label: string
  detail?: string
  actor?: string
  color?: string
  timestamp: string
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendamento criado',
  confirmed: 'Agendamento confirmado',
  attended: 'Consulta realizada',
  noshow: 'Paciente não compareceu',
  cancelled: 'Agendamento cancelado',
  rescheduled: 'Agendamento reagendado',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversations')
    .select('id, client_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const [eventsRes, followupRes, appointmentsRes, notesRes] = await Promise.all([
    admin
      .from('conversation_events')
      .select('id, event_type, payload, created_by, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('followup_events')
      .select('id, display_text, actor_type, actor_id, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('appointments')
      .select('id, title, status, modality, start_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('conversation_operator_notes')
      .select('id, content, operator_name, operator_email, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const items: ActivityItem[] = []

  for (const ev of eventsRes.data ?? []) {
    const meta = EVENT_TYPE_LABELS[ev.event_type as string]
    const label = meta?.label ?? (ev.event_type as string)
    const color = meta?.color ?? 'sky'
    const payload = ev.payload as Record<string, unknown> | null
    const detail =
      (payload?.reason_label as string | undefined) ??
      (payload?.reason as string | undefined) ??
      (payload?.previous_stage && payload?.new_stage
        ? `${payload.previous_stage} → ${payload.new_stage}`
        : undefined)
    items.push({
      id: `event_${ev.id as string}`,
      type: 'stage',
      label,
      detail,
      actor: ev.created_by as string | undefined,
      color,
      timestamp: ev.created_at as string,
    })
  }

  for (const ev of followupRes.data ?? []) {
    items.push({
      id: `followup_${ev.id as string}`,
      type: 'followup',
      label: ev.display_text as string,
      actor: ev.actor_type === 'human' ? (ev.actor_id as string | undefined) : (ev.actor_type as string),
      timestamp: ev.created_at as string,
    })
  }

  for (const ap of appointmentsRes.data ?? []) {
    const label = APPOINTMENT_STATUS_LABELS[ap.status as string] ?? `Agendamento: ${ap.status as string}`
    const parts = [
      ap.title as string | null,
      ap.modality ? `(${ap.modality as string})` : null,
      ap.start_at
        ? new Date(ap.start_at as string).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null,
    ].filter(Boolean)
    items.push({
      id: `appt_${ap.id as string}`,
      type: 'appointment',
      label,
      detail: parts.length > 0 ? parts.join(' ') : undefined,
      timestamp: ap.created_at as string,
    })
  }

  for (const note of notesRes.data ?? []) {
    const content = note.content as string
    items.push({
      id: `note_${note.id as string}`,
      type: 'note',
      label: 'Nota interna adicionada',
      detail: content.length > 60 ? content.slice(0, 60) + '…' : content,
      actor: (note.operator_name as string | null) ?? (note.operator_email as string),
      timestamp: note.created_at as string,
    })
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({ items })
}
