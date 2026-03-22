'use client'

import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

export type Deal = {
  id: string
  columnId: string
  title: string
  organization: string
  value: number
  owner: string
  status?: 'won' | 'lost' | 'open'
}

interface KanbanCardProps {
  deal: Deal
  isOverlay?: boolean
}

export function KanbanCard({ deal, isOverlay }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: deal,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
  }

  const statusBorder = deal.status === 'won' ? 'border-l-4 border-l-success' :
                       deal.status === 'lost' ? 'border-l-4 border-l-destructive' :
                       'border-l-4 border-l-transparent'

  const statusBg = deal.status === 'won' ? 'bg-success/10' :
                   deal.status === 'lost' ? 'bg-destructive/10' :
                   'bg-card'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-md border border-border p-3 shadow-sm hover:shadow transition-all cursor-grab active:cursor-grabbing",
        statusBg,
        statusBorder,
        isOverlay ? "opacity-90 scale-105 shadow-xl rotate-2 z-50 cursor-grabbing border-accent" : "",
        isDragging ? "opacity-30" : ""
      )}
    >
      <div className="flex items-start justify-between">
        <span className="font-semibold text-sm text-foreground">{deal.title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{deal.organization}</span>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 opacity-90">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
            {deal.owner}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(deal.value)}
          </span>
        </div>
      </div>

      <button className="absolute right-3 bottom-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
  )
}
