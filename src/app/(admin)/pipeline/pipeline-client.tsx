'use client'

import { useState } from 'react'
import { KanbanBoard } from '@/components/pipeline/kanban-board'
import { Button } from '@/components/ui/button'
import { MessageSquarePlus } from 'lucide-react'
import { NewConversationModal } from '@/components/layout/new-conversation-modal'
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

export function PipelinePageClient({ clients, initialClientId, viewerRole }: Props) {
  const [clientId, setClientId] = useState(initialClientId)
  const [storedMode] = useState<'admin' | 'client'>(() => {
    if (typeof window === 'undefined') return 'admin'
    const saved = localStorage.getItem('sidebar-mode')
    return saved === 'client' ? 'client' : 'admin'
  })
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const mode = viewerRole === 'operator' ? 'client' : storedMode

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4 animate-fade-in">
      <div className={`flex items-center ${mode === 'admin' ? 'justify-between' : 'justify-center'} min-h-[40px] gap-3`}>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground/90">Pipeline</h1>
        <div className="ml-auto flex items-center gap-3">
          <Button onClick={() => setNewConversationOpen(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Nova conversa
          </Button>
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
      </div>

      {clientId ? (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard clientId={clientId} refreshToken={refreshToken} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p>Nenhum cliente ativo encontrado.</p>
        </div>
      )}

      <NewConversationModal
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onSuccess={() => setRefreshToken((v) => v + 1)}
        clientId={clientId}
      />
    </div>
  )
}
