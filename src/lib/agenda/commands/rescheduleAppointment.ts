// Command: reagendar appointment (first-class operation).
// Encontra appointment existente, valida novo horário, atualiza.

import { validateAppointmentSlot } from '@/lib/agenda/availability'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  updateAgendaAppointment,
  getAgendaAppointmentById,
} from '@/lib/agenda/service'
import type { AgendaAppointment } from '@/types/pipeline'

export interface RescheduleAppointmentInput {
  /** ID do appointment (se conhecido). */
  appointmentId?: string | null
  /** external_event_id ou google_event_id (para lookup). */
  externalEventId?: string | null
  /** conversation_id (fallback: appointment mais recente da conversa). */
  conversationId?: string | null
  clientId: string
  newStartAt: string
  newEndAt: string
  title?: string | null
  skipValidation?: boolean
}

export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
): Promise<AgendaAppointment> {
  const existing = await findExistingAppointment(input)
  if (!existing) {
    throw new Error('Agendamento existente não encontrado para reagendamento')
  }

  if (!input.skipValidation) {
    const validation = await validateAppointmentSlot({
      clientId: input.clientId,
      startAt: input.newStartAt,
      endAt: input.newEndAt,
      ignoreAppointmentId: existing.id,
    })

    if (!validation.valid) {
      throw new Error(`Validação de horário falhou: ${validation.reason}`)
    }
  }

  return updateAgendaAppointment(existing.id, input.clientId, {
    startAt: input.newStartAt,
    endAt: input.newEndAt,
    ...(input.title ? { title: input.title } : {}),
    status: 'scheduled',
  })
}

async function findExistingAppointment(
  input: RescheduleAppointmentInput,
): Promise<AgendaAppointment | null> {
  // 1. Busca por ID direto
  if (input.appointmentId) {
    return getAgendaAppointmentById(input.appointmentId, input.clientId)
  }

  const admin = createAdminClient()

  // 2. Busca por external_event_id / google_event_id
  if (input.externalEventId) {
    const { data } = await admin
      .from('appointments')
      .select('id')
      .or(`google_event_id.eq.${input.externalEventId},external_event_id.eq.${input.externalEventId}`)
      .maybeSingle()

    if (data?.id) {
      return getAgendaAppointmentById(data.id, input.clientId)
    }
  }

  // 3. Fallback: appointment agendado mais recente da conversa
  if (input.conversationId) {
    const { data } = await admin
      .from('appointments')
      .select('id')
      .eq('conversation_id', input.conversationId)
      .in('status', ['scheduled', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.id) {
      return getAgendaAppointmentById(data.id, input.clientId)
    }
  }

  return null
}
