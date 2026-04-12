'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConversationList } from './conversation-list'
import { ChatView } from './chat-view'
import { DeskErrorBoundary } from './_internal/desk-error-boundary'
import { AnalyticsView } from './analytics-view'
import { MyCannedResponsesPanel } from './my-canned-responses-panel'
import { LogOut, MessageSquare, Bell, BarChart3, Zap } from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import { toast } from 'sonner'

type DeskTab = 'conversations' | 'analytics'

export interface DeskConversation {
  id: string
  stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved'
  status: string
  labels: string[]
  summary: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  stage_changed_at: string | null
  journey_stage: string | null
  handoff_reason_code: string | null
  contacts: { id: string; name: string | null; phone_number: string | null } | null
  assigned_operator_id: string | null
}

interface Props {
  clientId: string
  clientName: string
  userEmail: string
  userId: string
  initialConversationId?: string | null
}

export function DeskShell({ clientId, clientName, userEmail, userId, initialConversationId = null }: Props) {
  const [activeTab, setActiveTab] = useState<DeskTab>('conversations')
  const [conversations, setConversations] = useState<DeskConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId)
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [pendingCount, setPendingCount] = useState(0)
  const [stageCounts, setStageCounts] = useState<{ bot_triage: number; awaiting_human: number; in_service: number }>({ bot_triage: 0, awaiting_human: 0, in_service: 0 })
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [myShortcutsOpen, setMyShortcutsOpen] = useState(false)

  const fetchConversations = useCallback(async (stage: string) => {
    setLoading(true)
    setFetchError(null)
    const res = await fetch(`/api/desk/conversations?client_id=${clientId}&stage=${stage}`)
    if (res.ok) {
      const data = await res.json()
      setConversations(data)
    } else {
      const body = await res.json().catch(() => ({}))
      const msg = body?.error ?? `HTTP ${res.status}`
      console.error('[desk] fetchConversations error:', msg)
      setFetchError(msg)
    }
    setLoading(false)
  }, [clientId])

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/desk/stats?client_id=${clientId}`)
    if (res.ok) {
      const data = await res.json()
      setPendingCount(data.awaiting_human ?? 0)
      setStageCounts({
        bot_triage: data.bot_triage ?? 0,
        awaiting_human: data.awaiting_human ?? 0,
        in_service: data.in_service ?? 0,
      })
    }
  }, [clientId])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchConversations(stageFilter)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [stageFilter, fetchConversations])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchStats()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [fetchStats])

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

        setConversations((prev) => {
          const exists = prev.find((c) => c.id === updated.id)
          const matchesFilter =
            stageFilter === 'all'
              ? updated.stage !== 'resolved'
              : updated.stage === stageFilter

          if (!exists) {
            if (matchesFilter) return [updated, ...prev]
            return prev
          }

          if (!matchesFilter) return prev.filter((c) => c.id !== updated.id)
          return prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        })

        fetchStats()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clientId, stageFilter, fetchStats])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Periodic SLA alert check — toast when conversations cross the 1h threshold
  const alertedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const checkAlerts = () => {
      const now = Date.now()
      for (const conv of conversations) {
        if (conv.stage !== 'awaiting_human' || !conv.last_incoming_at) continue
        const waitMs = now - new Date(conv.last_incoming_at).getTime()
        if (waitMs > 60 * 60_000 && !alertedIds.current.has(conv.id)) {
          alertedIds.current.add(conv.id)
          const name = conv.contacts?.name ?? conv.contacts?.phone_number ?? 'Paciente'
          toast.warning(`SLA em risco — ${name}`, {
            description: 'Esperando há mais de 1 hora',
            duration: 8000,
          })
        }
      }
      // Clean up resolved / no longer awaiting
      for (const id of alertedIds.current) {
        const conv = conversations.find(c => c.id === id)
        if (!conv || conv.stage !== 'awaiting_human') alertedIds.current.delete(id)
      }
    }

    checkAlerts()
    const interval = setInterval(checkAlerts, 60_000)
    return () => clearInterval(interval)
  }, [conversations])

  return (
    <div className="flex h-full w-full overflow-hidden">
      {activeTab === 'conversations' && <aside className="hidden md:flex w-72 flex-shrink-0 flex-col border-r border-border bg-card/50">
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

        {fetchError ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 p-4 text-center">
            <p className="text-xs font-medium text-destructive">Erro ao carregar</p>
            <p className="text-[11px] text-muted-foreground break-all">{fetchError}</p>
            <button
              onClick={() => fetchConversations(stageFilter)}
              className="mt-1 text-xs text-primary underline underline-offset-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            stageFilter={stageFilter}
            loading={loading}
            stageCounts={stageCounts}
            currentUserId={userId}
            onSelect={setSelectedId}
            onStageChange={(s) => {
              setStageFilter(s)
              setSelectedId(null)
            }}
          />
        )}
      </aside>}

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('conversations')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'conversations'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <MessageSquare size={13} />
                <span className="hidden sm:inline">Conversas</span>
                {pendingCount > 0 && activeTab !== 'conversations' && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <BarChart3 size={13} />
                <span className="hidden sm:inline">Analytics</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMyShortcutsOpen(true)}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Meus atalhos pessoais"
            >
              <Zap size={16} />
            </button>
            <button
              onClick={() => setActiveTab('conversations')}
              className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Notificacoes"
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

        {activeTab === 'analytics' && (
          <AnalyticsView clientId={clientId} />
        )}

        {activeTab === 'conversations' && (
          <>
            {selectedId ? (
              <DeskErrorBoundary>
                <ChatView
                  key={selectedId}
                  conversationId={selectedId}
                  clientId={clientId}
                  currentUserId={userId}
                  onConversationUpdate={() => fetchConversations(stageFilter)}
                />
              </DeskErrorBoundary>
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
          </>
        )}
      </main>

      <MyCannedResponsesPanel
        clientId={clientId}
        open={myShortcutsOpen}
        onOpenChange={setMyShortcutsOpen}
      />
    </div>
  )
}
