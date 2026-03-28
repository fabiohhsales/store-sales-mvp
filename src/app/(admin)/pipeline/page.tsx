'use client'

import { useState } from 'react'
import { KanbanBoard } from '@/components/pipeline/kanban-board'
import { ClientSelector } from '@/components/pipeline/client-selector'

export default function PipelinePage() {
  const [clientId, setClientId] = useState('')

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pipeline</h1>
        <ClientSelector value={clientId} onChange={setClientId} />
      </div>

      {clientId ? (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard clientId={clientId} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p>Selecione um cliente para visualizar o pipeline</p>
        </div>
      )}
    </div>
  )
}
