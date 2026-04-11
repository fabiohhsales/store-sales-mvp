// Command: criar appointment com validação unificada.
// Tanto o bot quanto a UI chamam este command.

import { validateAppointmentSlot } from '@/lib/agenda/availability'
import { createAgendaAppointment, type AgendaUpsertInput } from '@/lib/agenda/service'
import type { AgendaAppointment } from '@/types/pipeline'

export interface CreateAppointmentInput extends AgendaUpsertInput {
  /** Se true, pula validação de slot (use com cautela). */
  skipValidation?: boolean
}

export async function createAppointment(input: CreateAppointmentInput): Promise<AgendaAppointment> {
  if (!input.skipValidation) {
    const validation = await validateAppointmentSlot({
      clientId: input.clientId,
      startAt: input.startAt,
      endAt: input.endAt,
    })

    if (!validation.valid) {
      throw new Error(`Validação de horário falhou: ${validation.reason}`)
    }
  }

  return createAgendaAppointment(input)
}
