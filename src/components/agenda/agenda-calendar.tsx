'use client'

import { AgendaWorkspace } from '@/components/agenda/agenda-workspace'

interface AgendaCalendarProps {
  clientId: string
  token?: string
}

export function AgendaCalendar({ clientId, token }: AgendaCalendarProps) {
  return <AgendaWorkspace clientId={clientId} token={token} initialView="week" />
}
