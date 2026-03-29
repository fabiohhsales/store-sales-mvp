'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Send, UserCheck, Bot, CheckCheck, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'

interface Message {
  id: string
  content: string | null
  content_type: string
  sender_type: string
  from_who: string
  created_at: string
}

interface ConversationDetail {
  id: string
  stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved'
  status: string
  summary: string | null
  labels: string[]
  contacts: { id: string; name: string | null; phone_number: string | null; identifier: string | null } | null
}

interface Props {
  conversationId: string
  clientId: string
  onConversationUpdate: () => void
}

const STAGE_LABELS = {
  bot_triage: 'Bot respondendo',
  awaiting_human: 'Bot pausado — aguardando você',
  in_service: 'Você está atendendo — bot pausado',
  resolved: 'Finalizado',
}

function MessageBubble({ message }: { message: Message }) {
  const isOutgoing = message.sender_type !== 'contact'
  const isBot = message.sender_type === 'agent_bot'
  const isOperator = message.sender_type === 'operator'

  const time = (() => {
    try {
      const diff = Date.now() - new Date(message.created_at).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return 'agora'
      if (mins < 60) return `${mins}min`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}h`
      return new Date(message.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    } catch { return '' }
  })()

  return (
    <div className={`flex gap-2 ${isOutgoing ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Indicador de origem */}
      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full mt-1 ${
        isBot ? 'bg-primary/15' :
        isOperator ? 'bg-blue-500/15' :
        'bg-secondary'
      }`}>
        {isBot ? (
          <Bot size={12} className="text-primary" />
        ) : isOperator ? (
          <UserCheck size={12} className="text-blue-500" />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">P</span>
        )}
      </div>

      <div className={`flex flex-col gap-1 max-w-[75%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isBot
            ? 'bg-primary/10 text-foreground rounded-tr-sm'
            : isOperator
              ? 'bg-blue-500/10 text-foreground rounded-tr-sm'
              : 'bg-secondary text-foreground rounded-tl-sm'
        }`}>
          {message.content_type !== 'text' ? (
            <span className="italic text-muted-foreground">{message.content}</span>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground px-1">{time}</span>
      </div>
    </div>
  )
}

export function ChatView({ conversationId, clientId, onConversationUpdate }: Props) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [actioning, setActioning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const res = await fetch(`/api/desk/conversations/${conversationId}?client_id=${clientId}`)
    if (res.ok) {
      const data = await res.json()
      setConversation(data.conversation)
      setMessages(data.messages)
    }
    if (showLoading) setLoading(false)
  }, [conversationId, clientId])

  useEffect(() => { load(true) }, [load])

  // Polling de fallback — garante atualização mesmo sem Realtime configurado no Supabase
  useEffect(() => {
    const interval = setInterval(() => load(false), 4000)
    return () => clearInterval(interval)
  }, [load])

  // Scroll para o final quando novas mensagens chegam
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime — novas mensagens desta conversa
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === (payload.new as Message).id)
          if (exists) return prev
          return [...prev, payload.new as Message]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      }, (payload) => {
        setConversation((prev) => prev ? { ...prev, ...(payload.new as ConversationDetail) } : prev)
        onConversationUpdate()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, onConversationUpdate])

  async function handleAction(action: 'assume' | 'return' | 'resolve') {
    setActioning(true)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(`Erro: ${body.error ?? 'falha ao executar ação'}`)
        return
      }

      // Aplica o novo stage diretamente sem esperar o próximo poll
      setConversation((prev) => prev ? { ...prev, stage: body.stage } : prev)

      const labels = { assume: 'Conversa assumida — você pode digitar', return: 'Bot retomou a conversa', resolve: 'Conversa finalizada' }
      toast.success(labels[action])
      onConversationUpdate()
    } catch (err) {
      toast.error('Erro de conexão ao executar ação')
    } finally {
      setActioning(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')

    // Otimista: adiciona a mensagem antes da resposta do servidor
    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [...prev, {
      id: tempId,
      content,
      content_type: 'text',
      sender_type: 'operator',
      from_who: 'human',
      created_at: new Date().toISOString(),
    }])

    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Falha ao enviar')
      const saved = await res.json()
      // Substitui a mensagem temporária pela salva
      setMessages((prev) => prev.map((m) => m.id === tempId ? saved : m))
    } catch {
      toast.error('Falha ao enviar mensagem')
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInput(content)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col p-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
            <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
            <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-48' : 'w-64'}`} />
          </div>
        ))}
      </div>
    )
  }

  if (!conversation) return null

  const stage = conversation.stage
  const canAssume = stage === 'awaiting_human' || stage === 'bot_triage'
  const canReturn = stage === 'in_service'
  const canSend = stage === 'in_service'
  const isResolved = stage === 'resolved'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Barra de ações */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              stage === 'awaiting_human' ? 'destructive' :
              stage === 'in_service' ? 'default' :
              'secondary'
            }
            className="text-xs"
          >
            {STAGE_LABELS[stage]}
          </Badge>
          {conversation.labels.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {conversation.labels.join(', ')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canAssume && (
            <Button
              size="sm"
              onClick={() => handleAction('assume')}
              disabled={actioning}
              className="h-8 text-xs"
            >
              {actioning ? <Loader2 size={12} className="mr-1 animate-spin" /> : <UserCheck size={12} className="mr-1" />}
              Assumir conversa
            </Button>
          )}

          {canReturn && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('return')}
              disabled={actioning}
              className="h-8 text-xs border-orange-500/40 text-orange-500 hover:bg-orange-500/10"
            >
              {actioning ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Bot size={12} className="mr-1" />}
              Devolver ao bot
            </Button>
          )}

          {!isResolved && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={actioning} className="h-8 text-xs">
                  <CheckCheck size={12} className="mr-1" />
                  Finalizar
                </Button>
              </DialogTrigger>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>Finalizar conversa?</DialogTitle>
                  <DialogDescription>
                    A conversa será marcada como resolvida e o bot não responderá mais.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={() => handleAction('resolve')}>Finalizar</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Resumo de triagem */}
      {conversation.summary && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-primary/5 border-b border-border text-xs text-muted-foreground">
          <Info size={13} className="text-primary mt-0.5 flex-shrink-0" />
          <span className="leading-relaxed">{conversation.summary}</span>
        </div>
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 bg-card/50 flex-shrink-0">
        {isResolved ? (
          <div className="flex items-center justify-center py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCheck size={13} className="text-green-500" />
              Conversa finalizada
            </p>
          </div>
        ) : !canSend ? (
          <div className="flex items-center justify-center py-2 gap-2">
            <UserCheck size={13} className="text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              Clique em <strong>Assumir conversa</strong> para pausar o bot e responder como o número
            </p>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem... (Enter para enviar)"
              className="min-h-[44px] max-h-32 resize-none text-sm"
              rows={1}
              disabled={sending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="h-11 w-11 flex-shrink-0"
            >
              {sending
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
