'use client'

import { useDraggable } from '@dnd-kit/core'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MessageCircle } from 'lucide-react'
import type { PipelineBoardConversation } from '@/types/pipeline'

interface PipelineCardProps {
  conversation: PipelineBoardConversation
  onClick: (conversation: PipelineBoardConversation) => void
  isOverlay?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  open: 'bg-emerald-500',
  resolved: 'bg-zinc-400',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function stageAge(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}min na etapa`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h na etapa`
  const days = Math.floor(hours / 24)
  return `${days}d na etapa`
}

const TEMP_DOT: Record<string, string> = {
  hot: 'bg-red-500',
  warm: 'bg-amber-400',
  cold: 'bg-sky-400',
}

const TEMP_LABEL: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
}

export function PipelineCard({ conversation, onClick, isOverlay }: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: conversation.id,
    data: { conversation },
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  const lastActivity = conversation.last_incoming_at || conversation.last_outgoing_at
  const intakePct = conversation.intake_fields_total > 0
    ? Math.round((conversation.intake_fields_filled / conversation.intake_fields_total) * 100)
    : null

  const temp = conversation.temperature ?? 'cold'

  function handleClick() {
    if (!isDragging) onClick(conversation)
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      className={[
        'relative cursor-grab p-4 transition-shadow hover:shadow-md active:cursor-grabbing select-none',
        isDragging ? 'opacity-40' : '',
        isOverlay ? 'shadow-xl rotate-1 cursor-grabbing' : '',
      ].join(' ')}
      {...(!isOverlay ? listeners : {})}
      {...(!isOverlay ? attributes : {})}
    >
      {/* Status dot */}
      <span
        className={`absolute top-3 right-3 h-2 w-2 rounded-full ${STATUS_COLORS[conversation.status] ?? 'bg-zinc-400'}`}
      />

      <div className="space-y-2.5 pr-4">
        {/* Nome e telefone */}
        <div className="min-w-0">
          <p className="font-medium text-sm leading-tight truncate">
            {conversation.contact_name || conversation.contact_phone || conversation.contact_identifier || 'Sem nome'}
          </p>
          {conversation.contact_phone && conversation.contact_name && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {conversation.contact_phone}
            </p>
          )}
        </div>

        {/* Temperatura + atividade + followup */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${TEMP_DOT[temp]}`} />
            {TEMP_LABEL[temp]}
          </span>
          {lastActivity && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(lastActivity)}
            </span>
          )}
          {conversation.followup_cadence && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              <MessageCircle className="h-2.5 w-2.5 mr-1" />
              {conversation.followup_cadence}
            </Badge>
          )}
        </div>

        {conversation.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {conversation.summary}
          </p>
        )}

        {conversation.stage_entered_at && (
          <p className="text-[11px] text-muted-foreground/70">
            {stageAge(conversation.stage_entered_at)}
          </p>
        )}

        {intakePct !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Intake</span>
              <span>{conversation.intake_fields_filled}/{conversation.intake_fields_total}</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full transition-all"
                style={{ width: `${intakePct}%` }}
              />
            </div>
          </div>
        )}

        {conversation.appointment && (
          <div className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-md px-2 py-1.5">
            <Calendar className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">{formatDate(conversation.appointment.start_at)}</span>
            {conversation.appointment.meet_link && (
              <a
                href={conversation.appointment.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline ml-auto shrink-0"
              >
                Meet
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
