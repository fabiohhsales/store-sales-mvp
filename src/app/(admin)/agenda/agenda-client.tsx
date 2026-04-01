'use client'

import { useState } from 'react'
import { AgendaTable } from '@/components/agenda/agenda-table'
import { AgendaCalendar } from '@/components/agenda/agenda-calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CalendarDays, List } from 'lucide-react'

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
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const isAdmin = viewerRole === 'admin'

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex items-center ${isAdmin ? 'justify-between' : 'justify-center'} flex-wrap gap-3`}>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agenda</h1>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={view === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none h-8"
              onClick={() => setView('calendar')}
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              Calendário
            </Button>
            <Button
              variant={view === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none h-8"
              onClick={() => setView('list')}
            >
              <List className="h-4 w-4 mr-1" />
              Lista
            </Button>
          </div>

          {/* Client selector (admin only) */}
          {isAdmin && clients.length > 1 && (
            <Select value={clientId} onValueChange={(val) => val && setClientId(val)}>
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
          {isAdmin && clients.length === 1 && (
            <span className="text-sm text-muted-foreground">{clients[0].name}</span>
          )}
        </div>
      </div>

      {clientId ? (
        view === 'calendar' ? (
          <AgendaCalendar clientId={clientId} />
        ) : (
          <AgendaTable clientId={clientId} />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
          <p>Nenhum cliente ativo encontrado.</p>
        </div>
      )}
    </div>
  )
}
