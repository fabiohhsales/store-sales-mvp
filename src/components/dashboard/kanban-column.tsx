'use client'

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { KanbanCard, type Deal } from './kanban-card'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  id: string
  title: string
  deals: Deal[]
}

export function KanbanColumn({ id, title, deals }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  const totalValue = deals.reduce((acc, deal) => acc + deal.value, 0)

  return (
    <div className="flex w-[320px] shrink-0 flex-col gap-2">
      <div className="group relative pr-4">
        <div className="absolute inset-0 bg-card shadow-sm border border-border rounded-sm -z-10"
             style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)' }} />

        <div className="absolute top-0 left-0 right-[5px] h-1 bg-secondary rounded-tl-sm z-0" />

        <div className="px-3 py-3 pb-2 z-10 relative">
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          <div className="mt-1 flex items-center text-xs text-muted-foreground font-medium tracking-tight">
            <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalValue)}</span>
            <span className="mx-1.5 opacity-50">•</span>
            <span>{deals.length} deals</span>

            <div className="ml-auto w-3.5 h-3.5 rounded-full border-[1.5px] border-border border-t-primary" />
          </div>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[500px] flex-col gap-2 rounded-md p-1.5 transition-colors",
          isOver ? "bg-accent ring-2 ring-ring ring-inset" : "bg-transparent"
        )}
      >
        {deals.map((deal) => (
          <KanbanCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  )
}
