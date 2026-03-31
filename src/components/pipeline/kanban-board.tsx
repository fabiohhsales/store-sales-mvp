'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { PipelineColumn } from './pipeline-column'
import { PipelineCard } from './pipeline-card'
import { PipelineFilters } from './pipeline-filters'
import { ConversationDetailModal } from './conversation-detail-modal'
import { Skeleton } from '@/components/ui/skeleton'
import type { PipelineConversation, PipelineData } from '@/types/pipeline'

interface KanbanBoardProps {
  clientId: string
  token?: string
  refreshToken?: number
}

export function KanbanBoard({ clientId, token, refreshToken = 0 }: KanbanBoardProps) {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Drag
  const [activeDrag, setActiveDrag] = useState<PipelineConversation | null>(null)

  // Modal
  const [selectedConversation, setSelectedConversation] = useState<PipelineConversation | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        ...(token ? { token } : { client_id: clientId }),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      })

      const res = await fetch(`/api/pipeline/conversations?${params}`)
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro ao carregar dados')
      }

      const result: PipelineData = await res.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [clientId, token, statusFilter])

  // Fetch inicial + auto-refresh 30s
  useEffect(() => {
    setLoading(true)
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData, refreshToken])

  // Filtro local por nome/telefone
  const filteredConversations = useMemo(() => {
    if (!data) return []
    if (!searchQuery.trim()) return data.conversations

    const q = searchQuery.toLowerCase()
    return data.conversations.filter(
      (c) =>
        (c.contact_name?.toLowerCase().includes(q)) ||
        (c.contact_phone?.includes(q))
    )
  }, [data, searchQuery])

  function handleDragStart(event: DragStartEvent) {
    const conv = data?.conversations.find((c) => c.id === event.active.id)
    if (conv) setActiveDrag(conv)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    const { active, over } = event
    if (!over || !data) return

    const draggedConv = data.conversations.find((c) => c.id === active.id)
    if (!draggedConv) return

    const targetColumnId = over.id as string
    if (targetColumnId === draggedConv.stage_slug) return

    // Update otimista
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === draggedConv.id ? { ...c, stage_slug: targetColumnId } : c
        ),
      }
    })

    // Chamada API
    try {
      const body = {
        conversation_id: draggedConv.id,
        ...(typeof draggedConv.chatwoot_conversation_id === 'number'
          ? { chatwoot_conversation_id: draggedConv.chatwoot_conversation_id }
          : {}),
        from_stage: draggedConv.stage_slug,
        to_stage: targetColumnId,
        ...(token ? { token } : { client_id: clientId }),
      }

      const res = await fetch('/api/pipeline/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        // Reverte em caso de erro
        fetchData()
      }
    } catch {
      fetchData()
    }
  }

  function handleCardClick(conversation: PipelineConversation) {
    setSelectedConversation(conversation)
    setModalOpen(true)
  }

  function handleMoveStage(
    conversationId: string,
    chatwootId: number | null,
    fromStage: string,
    toStage: string
  ) {
    // Update otimista
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, stage_slug: toStage }
            : c
        ),
      }
    })

    // Atualiza o conversation selecionado no modal
    setSelectedConversation((prev) =>
      prev && prev.id === conversationId
        ? { ...prev, stage_slug: toStage }
        : prev
    )

    // API call
    fetch('/api/pipeline/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        ...(typeof chatwootId === 'number' ? { chatwoot_conversation_id: chatwootId } : {}),
        from_stage: fromStage,
        to_stage: toStage,
        ...(token ? { token } : { client_id: clientId }),
      }),
    })
      .then((res) => {
        if (!res.ok) fetchData()
      })
      .catch(() => fetchData())
  }

  function handleMessageSent() {
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchData() }}
            className="text-sm text-primary hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Filtros */}
      <PipelineFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={filteredConversations.length}
      />

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 items-start gap-4 overflow-x-auto pb-4">
          {data.columns.map((column, index) => (
            <PipelineColumn
              key={column.slug}
              id={column.slug}
              title={column.display_name}
              conversations={filteredConversations.filter(
                (c) => c.stage_slug === column.slug
              )}
              colorIndex={index}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDrag ? (
            <PipelineCard
              conversation={activeDrag}
              onClick={() => {}}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal de detalhe */}
      <ConversationDetailModal
        conversation={selectedConversation}
        columns={data.columns}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onMoveStage={handleMoveStage}
        onMessageSent={handleMessageSent}
        clientId={clientId}
        token={token}
        chatwootAccountId={data.chatwootAccountId}
      />
    </div>
  )
}
