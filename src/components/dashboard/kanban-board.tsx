'use client'

import React, { useState } from 'react'
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { KanbanCard, type Deal } from './kanban-card'

const INITIAL_COLUMNS = [
  { id: 'qualified', title: 'Qualified' },
  { id: 'contact_made', title: 'Contact Made' },
  { id: 'demo_scheduled', title: 'Demo Scheduled' },
  { id: 'proposal_made', title: 'Proposal Made' },
  { id: 'negotiations', title: 'Negotiations Started' },
]

const INITIAL_DEALS: Deal[] = [
  { id: 'd1', columnId: 'qualified', title: 'Willamette Co deal', organization: 'Willamette Co', value: 1500, owner: 'PM' },
  { id: 'd2', columnId: 'qualified', title: 'Park Place deal', organization: 'Park Place', value: 4300, owner: 'JD' },
  { id: 'd3', columnId: 'contact_made', title: 'Tim and sons logistics', organization: 'Tim and sons logistics', value: 5200, owner: 'PM', status: 'lost' },
  { id: 'd4', columnId: 'demo_scheduled', title: 'Bringit media agency', organization: 'Bringit media', value: 1400, owner: 'PY' },
  { id: 'd5', columnId: 'proposal_made', title: 'Rio housing deal', organization: 'Rio housing', value: 2700, owner: 'JD' },
  { id: 'd6', columnId: 'negotiations', title: 'Maria M. retail LTD', organization: 'Maria M. retail', value: 2900, owner: 'PM', status: 'won' },
]

export function KanbanBoard() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const deal = deals.find((d) => d.id === active.id)
    if (deal) setActiveDeal(deal)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null)
    const { active, over } = event
    if (!over) return

    const activeDealId = active.id
    const overId = over.id
    
    // Simplification for the example: just move to the new column
    const overColumn = INITIAL_COLUMNS.find(c => c.id === overId)
    if (overColumn) {
      setDeals((prev) =>
        prev.map((deal) =>
          deal.id === activeDealId ? { ...deal, columnId: overColumn.id as string } : deal
        )
      )
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full items-start gap-4">
        {INITIAL_COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            title={column.title}
            deals={deals.filter((d) => d.columnId === column.id)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? <KanbanCard deal={activeDeal} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
