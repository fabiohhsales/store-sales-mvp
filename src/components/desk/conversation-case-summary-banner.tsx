'use client'

import { useState } from 'react'
import { Info, ChevronDown, ChevronUp, CalendarDays, ClipboardList, MessageSquare, Clock } from 'lucide-react'
import { relativeTime } from '@/lib/desk/conduction'

interface Props {
  summary: string | null
  customData: Record<string, string> | null
  appointmentStatus: string | null
  lastIncomingAt: string | null
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  rescheduled: 'Reagendado',
  cancelled: 'Cancelado',
  completed: 'Concluído',
  no_show: 'No-show',
}

export function ConversationCaseSummaryBanner({
  summary,
  customData,
  appointmentStatus,
  lastIncomingAt,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const dataKeys = customData ? Object.keys(customData).filter((k) => !k.startsWith('_')) : []
  const filledKeys = dataKeys.filter((k) => customData![k] && customData![k] !== '_skipped')
  const dataLabel = dataKeys.length > 0
    ? `${filledKeys.length}/${dataKeys.length} campos`
    : 'Nenhum'

  const agendaLabel = appointmentStatus
    ? STATUS_LABELS[appointmentStatus] ?? appointmentStatus
    : 'Sem agendamento'

  const firstSentence = summary
    ? summary.length > 80 ? summary.slice(0, 80) + '...' : summary
    : null

  const hasExpandableContent = summary && summary.length > 80

  return (
    <div className="flex flex-col px-4 py-2 bg-muted/30 border-b border-border text-xs flex-shrink-0">
      {/* Quick-glance grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-start gap-1.5">
          <MessageSquare size={12} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-muted-foreground block">Resumo</span>
            <span className="text-foreground/80 leading-snug line-clamp-1">
              {firstSentence ?? <span className="italic text-muted-foreground">Sem resumo de triagem</span>}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <ClipboardList size={12} className="text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground block">Dados coletados</span>
            <span className="text-foreground/80">{dataLabel}</span>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <CalendarDays size={12} className="text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground block">Agenda</span>
            <span className="text-foreground/80">{agendaLabel}</span>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <Clock size={12} className="text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground block">Último contato</span>
            <span className="text-foreground/80">{relativeTime(lastIncomingAt) || '—'}</span>
          </div>
        </div>
      </div>

      {/* Expandable full summary */}
      {hasExpandableContent && (
        <div className="mt-2">
          {expanded && (
            <div className="flex items-start gap-2 rounded-md bg-primary/5 p-2 mt-1">
              <Info size={13} className="text-primary mt-0.5 flex-shrink-0" />
              <span className="leading-relaxed text-foreground/80">{summary}</span>
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-primary/70 hover:text-primary mt-1 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Ver menos' : 'Ver resumo completo'}
          </button>
        </div>
      )}

      {/* Non-expandable summary (short enough to show inline) */}
      {summary && !hasExpandableContent && (
        <div className="flex items-start gap-2 rounded-md bg-primary/5 p-2 mt-2">
          <Info size={13} className="text-primary mt-0.5 flex-shrink-0" />
          <span className="leading-relaxed text-foreground/80">{summary}</span>
        </div>
      )}
    </div>
  )
}
