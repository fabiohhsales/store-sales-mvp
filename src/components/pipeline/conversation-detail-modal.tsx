'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Calendar, Clock, ExternalLink, MessageCircle, Phone, User } from 'lucide-react'
import { getChatwootPublicUrl } from '@/lib/config'
import type { PipelineConversation } from '@/types/pipeline'
import type { StageLabelConfig } from '@/types/database'
import { toast } from 'sonner'

interface ConversationDetailModalProps {
  conversation: PipelineConversation | null
  columns: StageLabelConfig[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMoveStage: (conversationId: string, chatwootId: number | null, fromStage: string, toStage: string) => void
  onMessageSent: () => void
  clientId: string
  token?: string
  chatwootAccountId?: number | null
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
  onMessageSent,
  clientId,
  token,
  chatwootAccountId,
}: ConversationDetailModalProps) {
  const chatwootUrl = getChatwootPublicUrl()
  const [messages, setMessages] = useState<MessageEntry[]>([])
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [autoMoveEnabled, setAutoMoveEnabled] = useState(true)
  const [autoMoveToStage, setAutoMoveToStage] = useState('')

  const loadingMessages = Boolean(
    conversation &&
    open &&
    loadedConversationId !== conversation.id
  )

  useEffect(() => {
    if (!conversation || !open) {
      return
    }

    let cancelled = false
    const params = new URLSearchParams({
      conversation_id: conversation.id,
      ...(token ? { token } : { client_id: clientId }),
    })

    fetch(`/api/pipeline/messages?${params}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setMessages(data)
          setLoadedConversationId(conversation.id)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([])
          setLoadedConversationId(conversation.id)
        }
      })

    return () => {
      cancelled = true
    }
  }, [conversation, open, clientId, token])

  useEffect(() => {
    if (!open || !conversation) return

    const storedEnabled = localStorage.getItem('pipeline-auto-move-enabled')
    const storedStage = localStorage.getItem('pipeline-auto-move-stage')

    if (storedEnabled === '0') {
      setAutoMoveEnabled(false)
    } else {
      setAutoMoveEnabled(true)
    }

    const validColumn = columns.some((c) => c.slug === storedStage)
    if (storedStage && validColumn) {
      setAutoMoveToStage(storedStage)
      return
    }

    const atendimentoStage = columns.find((c) => c.followup_cadence === 'atendimento')
    setAutoMoveToStage(atendimentoStage?.slug ?? conversation.stage_slug)
  }, [open, conversation, columns])

  if (!conversation) return null

  async function handleSendReply() {
    const content = reply.trim()
    if (!content || sendingReply) return

    setSendingReply(true)
    try {
      const res = await fetch('/api/pipeline/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          content,
          auto_move_enabled: autoMoveEnabled,
          auto_move_to_stage: autoMoveToStage,
          ...(token ? { token } : { client_id: clientId }),
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error ?? 'Falha ao enviar mensagem')
      }

      setMessages((prev) => [
        ...prev,
        {
          id: body?.id ?? `temp-${Date.now()}`,
          content,
          from_who: 'human',
          created_at: body?.created_at ?? new Date().toISOString(),
        },
      ])
      setReply('')

      localStorage.setItem('pipeline-auto-move-enabled', autoMoveEnabled ? '1' : '0')
      localStorage.setItem('pipeline-auto-move-stage', autoMoveToStage)

      onMessageSent()
      toast.success('Mensagem enviada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar mensagem')
    } finally {
      setSendingReply(false)
    }
  }

  const currentColumn = columns.find((c) => c.slug === conversation.stage_slug)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {conversation.contact_name || 'Sem nome'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
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
              {chatwootUrl && chatwootAccountId && conversation.chatwoot_conversation_id && (
                <a
                  href={`${chatwootUrl}/accounts/${chatwootAccountId}/conversations/${conversation.chatwoot_conversation_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir no Chatwoot
                </a>
              )}
              <Link
                href={`/desk?client_id=${clientId}&conversation_id=${conversation.id}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Ir para o Desk
              </Link>
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
                  if (newStage && newStage !== conversation.stage_slug) {
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
                <div className="space-y-2 max-h-72 overflow-y-auto">
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

            {/* Resposta inline */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Responder sem sair do pipeline</label>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Digite a resposta para o contato..."
              />
              <div className="rounded-md border p-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Ao enviar, mover automaticamente para etapa</span>
                  <Switch
                    checked={autoMoveEnabled}
                    onCheckedChange={(checked) => setAutoMoveEnabled(!!checked)}
                  />
                </div>
                <Select
                  value={autoMoveToStage}
                  onValueChange={setAutoMoveToStage}
                  disabled={!autoMoveEnabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a etapa" />
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
              <div className="flex justify-end">
                <Button onClick={handleSendReply} disabled={sendingReply || !reply.trim()}>
                  {sendingReply ? 'Enviando...' : 'Enviar resposta'}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Appointment */}
            {conversation.appointment && (
              <div className="space-y-2 rounded-md border p-3">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Agendamento
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
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
            )}
          </div>
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
