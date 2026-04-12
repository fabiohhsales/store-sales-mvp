'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { deriveConductionMode, conductionLabel, conductionBadgeVariant, relativeTime } from '@/lib/desk/conduction'

interface ConversationSummary {
  id: string
  stage: string | null
  status: string | null
  summary: string | null
  last_incoming_at: string | null
  created_at: string | null
}

interface Props {
  conversations: ConversationSummary[]
  currentConversationId: string
}

export function ConversationHistoryCard({ conversations, currentConversationId }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (conversations.length <= 1) {
    return null // Only current conversation, no history to show
  }

  const visible = expanded ? conversations : conversations.slice(0, 5)

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={14} className="text-primary" />
          <span className="text-xs font-medium">Histórico</span>
        </div>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {conversations.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {visible.map((conv) => {
          const isCurrent = conv.id === currentConversationId
          const conduction = deriveConductionMode(conv.stage)

          return (
            <div
              key={conv.id}
              className={`rounded-lg border p-2 space-y-1 ${isCurrent ? 'border-primary/30 bg-primary/5' : ''}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant={isCurrent ? 'default' : 'outline'}
                  className="text-[10px] h-4 px-1.5"
                >
                  {isCurrent ? 'Atual' : 'Histórico'}
                </Badge>
                <Badge
                  variant={conductionBadgeVariant(conduction)}
                  className="text-[10px] h-4 px-1.5"
                >
                  {conductionLabel(conduction)}
                </Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {relativeTime(conv.last_incoming_at || conv.created_at)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                {conv.summary?.trim() || 'Sem resumo de triagem'}
              </p>
            </div>
          )
        })}
      </div>

      {conversations.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors w-full justify-center"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Ver menos' : `Ver todas (${conversations.length})`}
        </button>
      )}
    </div>
  )
}
