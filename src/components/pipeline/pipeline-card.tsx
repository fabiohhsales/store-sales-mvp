'use client'

import { useDraggable } from '@dnd-kit/core'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MessageCircle } from 'lucide-react'
import type { PipelineConversation } from '@/types/pipeline'

interface PipelineCardProps {
  conversation: PipelineConversation
  onClick: (conversation: PipelineConversation) => void
  isOverlay?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-l-yellow-500',
  open: 'border-l-green-500',
  resolved: 'border-l-gray-400',
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

export function PipelineCard({ conversation, onClick, isOverlay }: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: conversation.id,
    data: { conversation },
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  const lastActivity = conversation.last_incoming_at || conversation.last_outgoing_at

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick(conversation)}
      className={`
        cursor-pointer border-l-4 p-3 transition-shadow hover:shadow-md
        ${STATUS_COLORS[conversation.status] || 'border-l-gray-300'}
        ${isDragging ? 'opacity-50' : ''}
        ${isOverlay ? 'shadow-lg rotate-2' : ''}
      `}
    >
      <div className="space-y-2">
        {/* Nome e telefone */}
        <div>
          <p className="font-medium text-sm leading-tight truncate">
            {conversation.contact_name || 'Sem nome'}
          </p>
          {conversation.contact_phone && (
            <p className="text-xs text-muted-foreground truncate">
              {conversation.contact_phone}
            </p>
          )}
        </div>

        {/* Última atividade + followup */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastActivity && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(lastActivity)}
            </span>
          )}
          {conversation.followup_cadence && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              <MessageCircle className="h-2.5 w-2.5 mr-0.5" />
              {conversation.followup_cadence}
            </Badge>
          )}
        </div>

        {/* Appointment */}
        {conversation.appointment && (
          <div className="flex items-center gap-1 text-xs bg-muted/50 rounded px-1.5 py-1">
            <Calendar className="h-3 w-3 text-primary" />
            <span>{formatDate(conversation.appointment.start_at)}</span>
            {conversation.appointment.meet_link && (
              <a
                href={conversation.appointment.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline ml-auto"
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
