'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ConversationList } from './conversation-list'
import { ChatView } from './chat-view'
import { LogOut, MessageSquare, Bell, ArrowLeft } from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import { toast } from 'sonner'

export interface DeskConversation {
  id: string
  stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved'
  status: string
  labels: string[]
  summary: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  contacts: { id: string; name: string | null; phone_number: string | null } | null
}

interface Props {
  clientId: string
  clientName: string
  userEmail: string
}

export function DeskShell({ clientId, clientName, userEmail }: Props) {
  const [conversations, setConversations] = useState<DeskConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string>('bot_triage')
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchConversations = useCallback(async (stage: string) => {
    const res = await fetch(`/api/desk/conversations?client_id=${clientId}&stage=${stage}`)
    if (res.ok) {
      const data = await res.json()
      setConversations(data)
    }
    setLoading(false)
  }, [clientId])

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/desk/stats?client_id=${clientId}`)
    if (res.ok) {
      const data = await res.json()
      setPendingCount(data.awaiting_human ?? 0)
    }
  }, [clientId])

  useEffect(() => {
    setLoading(true)
    fetchConversations(stageFilter)
  }, [stageFilter, fetchConversations])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Supabase Realtime — escuta mudanças nas conversas do cliente
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`desk:${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `client_id=eq.${clientId}`,
      }, (payload) => {
        const updated = payload.new as DeskConversation

        // Notifica quando nova conversa entra em awaiting_human
        if (
          payload.eventType === 'UPDATE' &&
          updated.stage === 'awaiting_human' &&
          (payload.old as DeskConversation).stage !== 'awaiting_human'
        ) {
          const name = updated.contacts?.name ?? 'Paciente'
          toast.info(`${name} aguardando atendimento`, {
            description: updated.summary ?? undefined,
          })
          setPendingCount((n) => n + 1)

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Paciente aguardando atendimento', {
              body: updated.summary ?? name,
            })
          }
        }

        // Atualiza lista local sem refetch completo
        setConversations((prev) => {
          const exists = prev.find((c) => c.id === updated.id)
          if (!exists) {
            // Nova conversa — só adiciona se bate com o filtro atual
            if (stageFilter === 'all' || updated.stage === stageFilter) {
              return [updated, ...prev]
            }
            return prev
          }
          // Conversa existente — remove se saiu do filtro, atualiza se continua
          if (stageFilter !== 'all' && updated.stage !== stageFilter) {
            return prev.filter((c) => c.id !== updated.id)
          }
          return prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        })

        fetchStats()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clientId, stageFilter, fetchStats])

  // Solicita permissão de notificação no primeiro uso
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Coluna esquerda — fila */}
      <aside className="hidden md:flex w-72 flex-shrink-0 flex-col border-r border-border bg-card/50">
        {/* Header da sidebar */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" />
            <span className="font-semibold text-sm text-foreground truncate max-w-[140px]">
              {clientName || 'Atendimento'}
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </div>

        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          stageFilter={stageFilter}
          loading={loading}
          onSelect={setSelectedId}
          onStageChange={(s) => {
            setStageFilter(s)
            setSelectedId(null)
          }}
        />
      </aside>

      {/* Coluna central — chat */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header do Desk */}
        <header className="flex h-14 items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Voltar ao admin"
            >
              <ArrowLeft size={16} />
            </a>
            {selectedConversation ? (
              <div>
                <p className="text-sm font-medium text-foreground">
                  {selectedConversation.contacts?.name ?? selectedConversation.contacts?.phone_number ?? 'Contato'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedConversation.contacts?.phone_number}
                </p>
              </div>
            ) : (
              <span className="text-sm font-medium text-foreground">Painel de Atendimento</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Notificações"
            >
              <Bell size={18} />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <span className="text-xs text-muted-foreground hidden sm:block">{userEmail}</span>
              <button
                onClick={() => logout()}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Chat */}
        {selectedId ? (
          <ChatView
            key={selectedId}
            conversationId={selectedId}
            clientId={clientId}
            onConversationUpdate={() => fetchConversations(stageFilter)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center p-8">
            <div className="space-y-2">
              <MessageSquare size={40} className="mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                Selecione uma conversa para atender
              </p>
              {pendingCount > 0 && (
                <p className="text-xs text-destructive font-medium">
                  {pendingCount} {pendingCount === 1 ? 'paciente aguardando' : 'pacientes aguardando'}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
