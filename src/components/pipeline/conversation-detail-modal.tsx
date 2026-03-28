'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Calendar, Clock, ExternalLink, MessageCircle, Phone, User } from 'lucide-react'
import type { PipelineConversation } from '@/types/pipeline'
import type { StageLabelConfig } from '@/types/database'

interface ConversationDetailModalProps {
  conversation: PipelineConversation | null
  columns: StageLabelConfig[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMoveStage: (conversationId: string, chatwootId: number, fromStage: string, toStage: string) => void
  clientId: string
  token?: string
}

interface MessageEntry {
  id: string
  content: string | null
  from_who: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  open: 'Aberto',
  resolved: 'Resolvido',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  open: 'default',
  resolved: 'outline',
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ConversationDetailModal({
  conversation,
  columns,
  open,
  onOpenChange,
  onMoveStage,
  clientId,
  token,
}: ConversationDetailModalProps) {
  const [messages, setMessages] = useState<MessageEntry[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  useEffect(() => {
    if (!conversation || !open) {
      setMessages([])
      return
    }

    setLoadingMessages(true)
    const params = new URLSearchParams({
      conversation_id: conversation.id,
      ...(token ? { token } : { client_id: clientId }),
    })

    fetch(`/api/pipeline/messages?${params}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMessages(data))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false))
  }, [conversation, open, clientId, token])

  if (!conversation) return null

  const currentColumn = columns.find((c) => c.slug === conversation.stage_slug)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {conversation.contact_name || 'Sem nome'}
          </DialogTitle>
        </DialogHeader>

        {/* Contato */}
        <div className="space-y-1 text-sm">
          {conversation.contact_phone && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {conversation.contact_phone}
            </p>
          )}
          {conversation.contact_identifier && (
            <p className="text-xs text-muted-foreground">
              ID: {conversation.contact_identifier}
            </p>
          )}
        </div>

        {/* Status + Stage */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={STATUS_VARIANTS[conversation.status]}>
            {STATUS_LABELS[conversation.status]}
          </Badge>
          {currentColumn && (
            <Badge variant="outline">{currentColumn.display_name}</Badge>
          )}
          {conversation.followup_cadence && (
            <Badge variant="outline" className="text-xs">
              <MessageCircle className="h-3 w-3 mr-1" />
              {conversation.followup_cadence}
            </Badge>
          )}
        </div>

        {/* Mover etapa */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Mover para etapa</label>
          <Select
            value={conversation.stage_slug}
            onValueChange={(newStage) => {
              if (newStage !== conversation.stage_slug) {
                onMoveStage(
                  conversation.id,
                  conversation.chatwoot_conversation_id,
                  conversation.stage_slug,
                  newStage
                )
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.slug} value={col.slug}>
                  {col.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Appointment */}
        {conversation.appointment && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Agendamento
              </h4>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>{formatDateTime(conversation.appointment.start_at)}</p>
                {conversation.appointment.status && (
                  <Badge variant="outline" className="text-xs">
                    {conversation.appointment.status}
                  </Badge>
                )}
                {conversation.appointment.meet_link && (
                  <a
                    href={conversation.appointment.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir Meet
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        {/* Mensagens recentes */}
        <Separator />
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            Mensagens recentes
          </h4>
          {loadingMessages ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma mensagem</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-xs rounded-lg p-2 ${
                    msg.from_who === 'lead'
                      ? 'bg-muted ml-0 mr-8'
                      : 'bg-primary/10 ml-8 mr-0'
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-medium">
                      {msg.from_who === 'lead' ? 'Contato' : msg.from_who === 'ai' ? 'IA' : 'Agente'}
                    </span>
                    <span className="text-muted-foreground">
                      <Clock className="h-2.5 w-2.5 inline mr-0.5" />
                      {formatDateTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">
                    {msg.content || '(sem conteúdo)'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações */}
        <Separator />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
