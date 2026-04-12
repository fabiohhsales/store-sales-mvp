'use client'

import { useState } from 'react'
import { CalendarDays, Clock, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/desk/conduction'

interface Appointment {
  id: string
  title: string | null
  start_at: string
  end_at: string | null
  modality: string | null
  status: string | null
  meet_link: string | null
}

interface Props {
  appointments: Appointment[]
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  confirmed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  rescheduled: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  cancelled: 'border-border bg-muted/40 text-muted-foreground',
  no_show: 'border-border bg-muted/40 text-muted-foreground',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  sync_error: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  rescheduled: 'Reagendado',
  cancelled: 'Cancelado',
  no_show: 'No-show',
  completed: 'Concluído',
  sync_error: 'Erro de sync',
}

export function ConversationAppointmentCard({ appointments }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays size={14} />
          <span className="text-xs">Nenhum agendamento</span>
        </div>
      </div>
    )
  }

  const visible = expanded ? appointments : appointments.slice(0, 2)

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-primary" />
          <span className="text-xs font-medium">Agendamentos</span>
        </div>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {appointments.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {visible.map((apt) => {
          const statusStyle = STATUS_STYLES[apt.status ?? ''] ?? ''
          const statusLabel = STATUS_LABELS[apt.status ?? ''] ?? apt.status ?? 'Pendente'

          return (
            <div key={apt.id} className="rounded-lg border p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">{apt.title ?? 'Consulta'}</span>
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 shrink-0 ${statusStyle}`}>
                  {statusLabel}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={11} />
                {formatDateTime(apt.start_at)}
                {apt.modality && <span className="text-muted-foreground/60">· {apt.modality}</span>}
              </div>

              {apt.meet_link && (
                <a
                  href={apt.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink size={10} />
                  Google Meet
                </a>
              )}
            </div>
          )
        })}
      </div>

      {appointments.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors w-full justify-center"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Ver menos' : `Ver todos (${appointments.length})`}
        </button>
      )}
    </div>
  )
}
