'use client'

import { useState, useEffect } from 'react'
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
  const [mode, setMode] = useState<'admin' | 'client'>('admin')

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-mode')
    if (saved === 'client' || saved === 'admin') setMode(saved)
  }, [])

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4 animate-fade-in">
      <div className={`flex items-center ${mode === 'admin' ? 'justify-between' : 'justify-center'} min-h-[40px]`}>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground/90">Pipeline</h1>
        {mode === 'admin' && clients.length > 1 && (
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
        {mode === 'admin' && clients.length === 1 && (
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
