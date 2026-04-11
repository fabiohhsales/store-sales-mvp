// Command: atualizar appointment com validação de slot (se horário mudou).

import { validateAppointmentSlot } from '@/lib/agenda/availability'
import {
  updateAgendaAppointment,
  getAgendaAppointmentById,
  type AgendaUpsertInput,
} from '@/lib/agenda/service'
import type { AgendaAppointment } from '@/types/pipeline'

export interface UpdateAppointmentInput {
  id: string
  clientId: string
  changes: Partial<Omit<AgendaUpsertInput, 'clientId'>>
  skipValidation?: boolean
}

export async function updateAppointment(input: UpdateAppointmentInput): Promise<AgendaAppointment> {
  // Valida slot se horário mudou
  if (!input.skipValidation && (input.changes.startAt || input.changes.endAt)) {
    const existing = await getAgendaAppointmentById(input.id, input.clientId)
    if (!existing) throw new Error('Agendamento não encontrado')

    const validation = await validateAppointmentSlot({
      clientId: input.clientId,
      startAt: input.changes.startAt ?? existing.start_at,
      endAt: input.changes.endAt ?? existing.end_at,
      ignoreAppointmentId: input.id,
    })

    if (!validation.valid) {
      throw new Error(`Validação de horário falhou: ${validation.reason}`)
    }
  }

  return updateAgendaAppointment(input.id, input.clientId, input.changes)
}
