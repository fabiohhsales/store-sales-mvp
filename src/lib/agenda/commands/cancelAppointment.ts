// Command: cancelar appointment. Wrapper fino sobre service.

import { cancelAgendaAppointment } from '@/lib/agenda/service'
import type { AgendaAppointment } from '@/types/pipeline'

export async function cancelAppointment(
  id: string,
  clientId: string,
): Promise<AgendaAppointment> {
  return cancelAgendaAppointment(id, clientId)
}
