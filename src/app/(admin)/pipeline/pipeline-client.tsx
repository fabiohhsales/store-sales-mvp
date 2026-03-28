'use client'

import { useState } from 'react'
import { KanbanBoard } from '@/components/pipeline/kanban-board'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ClientOption {
  id: string
  name: string
}

interface Props {
  clients: ClientOption[]
  initialClientId: string
}

export function PipelinePageClient({ clients, initialClientId }: Props) {
  const [clientId, setClientId] = useState(initialClientId)

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pipeline</h1>
        {clients.length > 1 && (
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Selecione um cliente" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {clients.length === 1 && (
          <span className="text-sm text-muted-foreground">{clients[0].name}</span>
        )}
      </div>

      {clientId ? (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard clientId={clientId} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p>Nenhum cliente ativo encontrado.</p>
        </div>
      )}
    </div>
  )
}
