'use client'

import { useDroppable } from '@dnd-kit/core'
import { PipelineCard } from './pipeline-card'
import type { PipelineConversation } from '@/types/pipeline'

interface PipelineColumnProps {
  id: string
  title: string
  conversations: PipelineConversation[]
  colorIndex: number
  onCardClick: (conversation: PipelineConversation) => void
  /** ID da conversa ativa no Chatwoot (para highlight) */
  activeChatwootId?: number | null
}

const COLUMN_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
]

export function PipelineColumn({
  id,
  title,
  conversations,
  colorIndex,
  onCardClick,
  activeChatwootId,
}: PipelineColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const color = COLUMN_COLORS[colorIndex % COLUMN_COLORS.length]

  return (
    <div
      ref={setNodeRef}
      className={`
        flex h-full w-72 min-w-[18rem] flex-col rounded-lg border bg-card
        ${isOver ? 'ring-2 ring-primary/50' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold truncate">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {conversations.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhuma conversa
          </p>
        ) : (
          conversations.map((conv) => (
            <PipelineCard
              key={conv.id}
              conversation={conv}
              onClick={onCardClick}
              isActive={activeChatwootId != null && conv.chatwoot_conversation_id === activeChatwootId}
            />
          ))
        )}
      </div>
    </div>
  )
}
