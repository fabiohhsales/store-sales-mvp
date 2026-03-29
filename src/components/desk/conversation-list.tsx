'use client'

import { Bot, Clock, UserCheck, CheckCheck, MessageSquare } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { DeskConversation } from './desk-shell'

const STAGES = [
  { key: 'all',            label: 'Todas ativas', icon: MessageSquare, color: 'text-foreground' },
  { key: 'awaiting_human', label: 'Aguardando', icon: Clock, color: 'text-destructive' },
  { key: 'in_service',     label: 'Em atendimento', icon: UserCheck, color: 'text-blue-500' },
  { key: 'bot_triage',     label: 'Com o bot', icon: Bot, color: 'text-muted-foreground' },
  { key: 'resolved',       label: 'Finalizados', icon: CheckCheck, color: 'text-green-500' },
] as const

interface Props {
  conversations: DeskConversation[]
  selectedId: string | null
  stageFilter: string
  loading: boolean
  onSelect: (id: string) => void
  onStageChange: (stage: string) => void
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

function relativeTime(date: string | null): string {
  if (!date) return ''
  try {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  } catch {
    return ''
  }
}

export function ConversationList({ conversations, selectedId, stageFilter, loading, onSelect, onStageChange }: Props) {
  const currentStage = STAGES.find((s) => s.key === stageFilter) ?? STAGES[0]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tabs de stage */}
      <div className="flex flex-col gap-0.5 p-2 border-b border-border">
        {STAGES.map((stage) => {
          const Icon = stage.icon
          const isActive = stageFilter === stage.key
          return (
            <button
              key={stage.key}
              onClick={() => onStageChange(stage.key)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                isActive
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Icon size={15} className={isActive ? stage.color : ''} />
              {stage.label}
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
                <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <currentStage.icon size={24} className="text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              {currentStage.key === 'all'
                ? 'Nenhuma conversa ativa'
                : `Nenhuma conversa em ${currentStage.label.toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 p-2">
            {conversations.map((conv) => {
              const isSelected = conv.id === selectedId
              const name = conv.contacts?.name ?? conv.contacts?.phone_number ?? 'Desconhecido'
              const isUrgent = conv.stage === 'awaiting_human'

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-secondary/60 border border-transparent'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isUrgent ? 'bg-destructive/15 text-destructive' :
                    isSelected ? 'bg-primary/15 text-primary' :
                    'bg-secondary text-muted-foreground'
                  }`}>
                    {getInitials(conv.contacts?.name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-sm font-medium truncate ${isUrgent ? 'text-foreground' : 'text-foreground/90'}`}>
                        {name}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {relativeTime(conv.last_incoming_at)}
                      </span>
                    </div>

                    {conv.summary ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {conv.summary}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">
                        {conv.contacts?.phone_number ?? '—'}
                      </p>
                    )}

                    {stageFilter === 'all' && !isUrgent && conv.stage === 'in_service' && (
                      <Badge variant="default" className="mt-1.5 h-4 text-[10px] px-1.5">
                        Em atendimento
                      </Badge>
                    )}
                    {isUrgent && (
                      <Badge variant="destructive" className="mt-1.5 h-4 text-[10px] px-1.5">
                        Aguardando atendimento
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
