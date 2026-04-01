'use client'

import { useState } from 'react'
import { AgendaWorkspace } from '@/components/agenda/agenda-workspace'
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
  viewerRole: 'admin' | 'operator'
}

export function AgendaPageClient({ clients, initialClientId, viewerRole }: Props) {
  const [clientId, setClientId] = useState(initialClientId)
  const isAdmin = viewerRole === 'admin'

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex items-center ${isAdmin ? 'justify-between' : 'justify-center'} flex-wrap gap-3`}>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agenda</h1>

        <div className="flex items-center gap-3">
          {isAdmin && clients.length > 1 && (
            <Select value={clientId} onValueChange={(value) => value && setClientId(value)}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && clients.length === 1 && (
            <span className="text-sm text-muted-foreground">{clients[0].name}</span>
          )}
        </div>
      </div>

      {clientId ? (
        <AgendaWorkspace clientId={clientId} initialView="week" />
      ) : (
        <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
          <p>Nenhum cliente ativo encontrado.</p>
        </div>
      )}
    </div>
  )
}
