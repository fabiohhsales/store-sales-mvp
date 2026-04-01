'use client'

import { AgendaWorkspace } from '@/components/agenda/agenda-workspace'

interface AgendaTableProps {
  clientId: string
  token?: string
}

export function AgendaTable({ clientId, token }: AgendaTableProps) {
  return <AgendaWorkspace clientId={clientId} token={token} initialView="list" />
}
