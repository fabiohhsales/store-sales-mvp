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
      {/* O Header estilo Pipedrive com um shape que indica progressão */}
      <div className="group relative pr-4">
        {/* 'Arrow' effect background */}
        <div className="absolute inset-0 bg-white shadow-sm border border-zinc-200 rounded-sm -z-10" 
             style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)' }} />
             
        {/* Top colored line (just an example, usually first column is white/gray, others vary) */}
        <div className="absolute top-0 left-0 right-[5px] h-1 bg-zinc-200 rounded-tl-sm z-0" />
        
        <div className="px-3 py-3 pb-2 z-10 relative">
          <h3 className="font-semibold text-sm text-[#2d3142]">{title}</h3>
          <div className="mt-1 flex items-center text-xs text-zinc-500 font-medium tracking-tight">
            <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalValue)}</span>
            <span className="mx-1.5 opacity-50">•</span>
            <span>{deals.length} deals</span>
            
            {/* Loading circle icon simulating Pipedrive probability/rottenness */}
            <div className="ml-auto w-3.5 h-3.5 rounded-full border-[1.5px] border-zinc-200 border-t-[#00a651]" />
          </div>
        </div>
      </div>
      
      {/* Drop zone container */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[500px] flex-col gap-2 rounded-md p-1.5 transition-colors",
          isOver ? "bg-zinc-100 ring-2 ring-zinc-300 ring-inset" : "bg-transparent"
        )}
      >
        {deals.map((deal) => (
          <KanbanCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  )
}
