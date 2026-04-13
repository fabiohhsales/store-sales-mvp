'use client'

import { useState } from 'react'
import { Bot, Clock, UserCheck, CheckCheck, MessageSquare, Search, AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { deriveConductionMode, conductionLabel, conductionBadgeVariant, handoffReasonLabel } from '@/lib/desk/conduction'
import { getWaitingBadge as getWaitingBadgeUnified, deriveAlerts } from '@/lib/desk/alerts'
import type { SlaThresholds } from '@/lib/desk/sla-config'
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
  stageCounts?: { bot_triage: number; awaiting_human: number; in_service: number }
  currentUserId?: string
  onSelect: (id: string) => void
  onStageChange: (stage: string) => void
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

function formatCommercialLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
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

type ListAlert = { icon: 'warning' | 'danger'; tip: string }

function deriveListAlert(conv: DeskConversation, thresholds?: SlaThresholds): ListAlert | null {
  const alerts = deriveAlerts(
    {
      stage: conv.stage,
      lastIncomingAt: conv.last_incoming_at,
      lastOutgoingAt: conv.last_outgoing_at,
      assignedOperatorId: conv.assigned_operator_id,
    },
    thresholds
  )
  if (alerts.length === 0) return null
  const first = alerts[0]
  return {
    icon: first.severity === 'danger' ? 'danger' : 'warning',
    tip: first.message,
  }
}

export function ConversationList({ conversations, selectedId, stageFilter, loading, stageCounts, currentUserId, onSelect, onStageChange }: Props) {
  const currentStage = STAGES.find((s) => s.key === stageFilter) ?? STAGES[0]
  const [searchQuery, setSearchQuery] = useState('')
  const [journeyFilter, setJourneyFilter] = useState<string>('all')

  // Collect distinct journey_stage values for the filter
  const journeyStages = Array.from(
    new Set(conversations.map((c) => c.journey_stage).filter(Boolean) as string[])
  ).sort()

  let visibleConversations = searchQuery.trim()
    ? conversations.filter((c) => {
        const q = searchQuery.toLowerCase()
        return (
          (c.contacts?.name?.toLowerCase().includes(q)) ||
          (c.contacts?.phone_number?.includes(q))
        )
      })
    : conversations

  if (journeyFilter !== 'all') {
    visibleConversations = visibleConversations.filter((c) => c.journey_stage === journeyFilter)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Busca */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Funil comercial</p>
        {journeyStages.length > 0 && (
          <select
            value={journeyFilter}
            onChange={(e) => setJourneyFilter(e.target.value)}
            className="mt-1 h-7 w-full rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">Todo o funil comercial</option>
            {journeyStages.map((js) => (
              <option key={js} value={js}>{formatCommercialLabel(js)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs de stage */}
      <div className="px-2 pt-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Operacional</p>
      </div>
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
              <span className="flex-1">{stage.label}</span>
              {stageCounts && stage.key !== 'all' && stage.key !== 'resolved' && (stageCounts as Record<string, number>)[stage.key] > 0 && (
                <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  stage.key === 'awaiting_human'
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {(stageCounts as Record<string, number>)[stage.key]}
                </span>
              )}
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
        ) : visibleConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <currentStage.icon size={24} className="text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              {searchQuery.trim()
                ? 'Nenhum resultado para esta busca'
                : currentStage.key === 'all'
                  ? 'Nenhuma conversa ativa'
                  : `Nenhuma conversa em ${currentStage.label.toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 p-2">
            {visibleConversations.map((conv) => {
              const isSelected = conv.id === selectedId
              const name = conv.contacts?.name ?? conv.contacts?.phone_number ?? 'Desconhecido'
              const isAwaitingHuman = conv.stage === 'awaiting_human'
              const waitingBadge = isAwaitingHuman ? getWaitingBadgeUnified(conv.last_incoming_at) : null
              const isAssignedToMe = !!(currentUserId && conv.assigned_operator_id === currentUserId)
              const alert = deriveListAlert(conv)

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
                  <div className="relative flex-shrink-0">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                      isAwaitingHuman ? 'bg-destructive/15 text-destructive' :
                      isSelected ? 'bg-primary/15 text-primary' :
                      'bg-secondary text-muted-foreground'
                    }`}>
                      {getInitials(conv.contacts?.name)}
                    </div>
                    {alert && (
                      <span
                        title={alert.tip}
                        className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ${
                          alert.icon === 'danger'
                            ? 'bg-destructive text-destructive-foreground'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        <AlertTriangle size={10} />
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-sm font-medium truncate ${isAwaitingHuman ? 'text-foreground' : 'text-foreground/90'}`}>
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

                    {stageFilter === 'all' && !isAwaitingHuman && (
                      <Badge
                        variant={conductionBadgeVariant(deriveConductionMode(conv.stage))}
                        className="mt-1.5 h-4 text-[10px] px-1.5"
                      >
                        {conductionLabel(deriveConductionMode(conv.stage))}
                      </Badge>
                    )}
                    {isAwaitingHuman && waitingBadge && (
                      <Badge
                        variant="outline"
                        className={`mt-1.5 h-4 px-1.5 text-[10px] ${waitingBadge.className}`}
                      >
                        {waitingBadge.label}
                      </Badge>
                    )}
                    {isAssignedToMe && (
                      <Badge
                        variant="outline"
                        className="mt-1.5 h-4 px-1.5 text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      >
                        Você
                      </Badge>
                    )}
                    {conv.journey_stage && (
                      <Badge
                        variant="outline"
                        className="mt-1.5 h-4 px-1.5 text-[10px] border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                      >
                        Comercial: {formatCommercialLabel(conv.journey_stage)}
                      </Badge>
                    )}
                    {conv.handoff_reason_code && (
                      <Badge
                        variant="outline"
                        className="mt-1.5 h-4 px-1.5 text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      >
                        {handoffReasonLabel(conv.handoff_reason_code) ?? conv.handoff_reason_code}
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
