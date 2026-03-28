'use client'

import { useState } from 'react'
import { AgendaTable } from '@/components/agenda/agenda-table'
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

export function AgendaPageClient({ clients, initialClientId }: Props) {
  const [clientId, setClientId] = useState(initialClientId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agenda</h1>
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
        <AgendaTable clientId={clientId} />
      ) : (
        <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
          <p>Nenhum cliente ativo encontrado.</p>
        </div>
      )}
    </div>
  )
}
