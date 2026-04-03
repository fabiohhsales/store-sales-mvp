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
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { PipelineColumn } from './pipeline-column'
import { PipelineCard } from './pipeline-card'
import { PipelineFilters } from './pipeline-filters'
import { ConversationDetailModal } from './conversation-detail-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import type { PipelineBoardConversation, PipelineBoardData } from '@/types/pipeline'

interface KanbanBoardProps {
  clientId: string
  token?: string
  refreshToken?: number
}

export function KanbanBoard({ clientId, token, refreshToken = 0 }: KanbanBoardProps) {
  const [data, setData] = useState<PipelineBoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [activeDrag, setActiveDrag] = useState<PipelineBoardConversation | null>(null)

  const [selectedConversation, setSelectedConversation] = useState<PipelineBoardConversation | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
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

      const result: PipelineBoardData = await res.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [clientId, token, statusFilter])

  useEffect(() => {
    setLoading(true)
    void fetchData()
    const interval = setInterval(() => {
      void fetchData()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchData, refreshToken])

  const filteredConversations = useMemo(() => {
    if (!data) return []
    if (!searchQuery.trim()) return data.conversations

    const normalizedQuery = searchQuery.toLowerCase()
    return data.conversations.filter(
      (conversation) =>
        conversation.contact_name?.toLowerCase().includes(normalizedQuery) ||
        conversation.contact_phone?.includes(normalizedQuery)
    )
  }, [data, searchQuery])

  const applyStageLocally = useCallback((conversationId: string, stageSlug: string) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        conversations: prev.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, stage_slug: stageSlug }
            : conversation
        ),
      }
    })

    setSelectedConversation((prev) =>
      prev && prev.id === conversationId
        ? { ...prev, stage_slug: stageSlug }
        : prev
    )
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const conversation = data?.conversations.find((item) => item.id === event.active.id)
    if (conversation) {
      setActiveDrag(conversation)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    const { active, over } = event
    if (!over || !data) return

    const draggedConversation = data.conversations.find((conversation) => conversation.id === active.id)
    if (!draggedConversation) return

    const targetColumnId = over.id as string
    if (targetColumnId === draggedConversation.stage_slug) return

    const previousStage = draggedConversation.stage_slug
    applyStageLocally(draggedConversation.id, targetColumnId)

    try {
      const res = await fetch('/api/pipeline/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: draggedConversation.id,
          ...(typeof draggedConversation.chatwoot_conversation_id === 'number'
            ? { chatwoot_conversation_id: draggedConversation.chatwoot_conversation_id }
            : {}),
          from_stage: previousStage,
          to_stage: targetColumnId,
          ...(token ? { token } : { client_id: clientId }),
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        toast.error(errBody.error || 'Erro ao mover etapa')
        applyStageLocally(draggedConversation.id, previousStage)
        void fetchData()
      }
    } catch {
      toast.error('Erro de conexão ao mover etapa')
      applyStageLocally(draggedConversation.id, previousStage)
      void fetchData()
    }
  }

  function handleCardClick(conversation: PipelineBoardConversation) {
    setSelectedConversation(conversation)
    setModalOpen(true)
  }

  async function handleMoveStage(
    conversationId: string,
    chatwootId: number | null,
    fromStage: string,
    toStage: string
  ) {
    applyStageLocally(conversationId, toStage)

    try {
      const res = await fetch('/api/pipeline/move', {
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

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        toast.error(errBody.error || 'Erro ao mover etapa')
        applyStageLocally(conversationId, fromStage)
        void fetchData()
      }
    } catch {
      toast.error('Erro de conexão ao mover etapa')
      applyStageLocally(conversationId, fromStage)
      void fetchData()
    }
  }

  function handleMessageSent(nextStageSlug?: string) {
    if (selectedConversation && nextStageSlug) {
      applyStageLocally(selectedConversation.id, nextStageSlug)
    }
    void fetchData()
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-96 w-72" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="font-medium text-destructive">{error}</p>
          <button
            onClick={() => {
              setLoading(true)
              void fetchData()
            }}
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
      <PipelineFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={filteredConversations.length}
      />

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
                (conversation) => conversation.stage_slug === column.slug
              )}
              colorIndex={index}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDrag ? (
            <PipelineCard conversation={activeDrag} onClick={() => {}} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

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
