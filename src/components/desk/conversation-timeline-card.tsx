'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp } from 'lucide-react'
import { Timeline } from '@/components/ui/timeline'
import { EVENT_TYPE_LABELS } from '@/lib/desk/conduction'
import { formatDateTime } from '@/lib/desk/conduction'
import type { ContextEvent } from '@/types/conversation-context'

interface Props {
  events: ContextEvent[]
  operators?: { id: string; name: string }[]
}

const COLLAPSED_COUNT = 5

function eventDetail(event: ContextEvent, operators?: Props['operators']): string | null {
  const parts: string[] = []

  // Actor name
  if (event.created_by) {
    const op = operators?.find((o) => o.id === event.created_by)
    parts.push(op ? op.name : event.event_source === 'bot' ? 'Bot' : 'Operador')
  }

  // Payload extras
  const p = event.payload
  if (p) {
    if (typeof p.reason === 'string') parts.push(p.reason)
    if (typeof p.previous_stage === 'string') parts.push(`de ${p.previous_stage}`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export function ConversationTimelineCard({ events, operators }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (events.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 mb-2">
          <History size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Linha do tempo</span>
        </div>
        <p className="text-xs text-muted-foreground/60 italic">Nenhum evento registrado</p>
      </div>
    )
  }

  const visible = expanded ? events : events.slice(0, COLLAPSED_COUNT)
  const hasMore = events.length > COLLAPSED_COUNT

  const items = visible.map((e) => {
    const meta = EVENT_TYPE_LABELS[e.event_type]
    return {
      id: e.id,
      label: meta?.label ?? e.event_type,
      detail: eventDetail(e, operators),
      timestamp: formatDateTime(e.created_at),
      color: meta?.color,
    }
  })

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Linha do tempo
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {events.length} evento{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Timeline items={items} />

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-2 transition-colors"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Ver menos' : `Ver todos (${events.length})`}
        </button>
      )}
    </div>
  )
}
