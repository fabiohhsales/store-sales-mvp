'use client'

import { useState } from 'react'
import { AgendaTable } from '@/components/agenda/agenda-table'
import { ClientSelector } from '@/components/pipeline/client-selector'

export default function AgendaPage() {
  const [clientId, setClientId] = useState('')

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agenda</h1>
        <ClientSelector value={clientId} onChange={setClientId} />
      </div>

      {clientId ? (
        <AgendaTable clientId={clientId} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p>Selecione um cliente para visualizar a agenda</p>
        </div>
      )}
    </div>
  )
}
