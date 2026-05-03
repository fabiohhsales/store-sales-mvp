'use client'

import { useDroppable } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PipelineCard } from './pipeline-card'
import type { PipelineBoardConversation } from '@/types/pipeline'

interface PipelineColumnProps {
  id: string
  title: string
  conversations: PipelineBoardConversation[]
  colorIndex: number
  onCardClick: (conversation: PipelineBoardConversation) => void
  canMoveLeft: boolean
  canMoveRight: boolean
  onMoveLeft: () => void
  onMoveRight: () => void
}

const COLUMN_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-indigo-500',
]

export function PipelineColumn({
  id,
  title,
  conversations,
  colorIndex,
  onCardClick,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
}: PipelineColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const color = COLUMN_COLORS[colorIndex % COLUMN_COLORS.length]

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex h-full w-72 min-w-[18rem] flex-col rounded-lg border bg-card',
        isOver ? 'ring-2 ring-primary/40' : '',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <div className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
        <h3 className="text-sm font-semibold truncate flex-1">{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
          {conversations.length}
        </span>
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button
            type="button"
            disabled={!canMoveLeft}
            onClick={onMoveLeft}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Mover coluna para esquerda"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canMoveRight}
            onClick={onMoveRight}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Mover coluna para direita"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
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
            />
          ))
        )}
      </div>
    </div>
  )
}
