'use client'

import Link from 'next/link'
import { ArrowUpRight, Ban, Clock3, SendHorizonal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FollowupConversation } from '@/types/followup'

const CADENCE_STYLES = {
  lead: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
  atendimento: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  agendado: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
} as const

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderStatus(conversation: FollowupConversation) {
  if (conversation.waiting_response) {
    if (conversation.total_attempts > 1) {
      return `Sem resposta (${conversation.total_attempts} tentativas)`
    }
    return 'Sem resposta'
  }

  if (conversation.last_incoming_at) {
    return `Respondeu em ${formatDate(conversation.last_incoming_at)}`
  }

  return 'Sem resposta'
}

interface Props {
  clientId: string
  conversation: FollowupConversation
  onSend: (conversation: FollowupConversation) => void
  onCancel: (conversation: FollowupConversation) => void
}

export function FollowupConversationCard({ clientId, conversation, onSend, onCancel }: Props) {
  return (
    <article className="rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">
              {conversation.contact_name}
            </h3>
            {conversation.contact_phone && (
              <span className="text-sm text-muted-foreground">{conversation.contact_phone}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={CADENCE_STYLES[conversation.cadence_type]}>
              {conversation.cadence_type === 'lead'
                ? 'Lead'
                : conversation.cadence_type === 'atendimento'
                  ? 'Atendimento'
                  : 'Agendado'}
            </Badge>
            <Badge variant="outline">{conversation.current_step_label}</Badge>
            <span className="text-muted-foreground">
              Enviado em {formatDate(conversation.step_sent_at)}
            </span>
          </div>

          <p className="rounded-xl bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            {conversation.last_message_preview || 'Sem preview disponivel.'}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <Clock3 className="size-4 text-muted-foreground" />
            <span className={conversation.waiting_response ? 'text-amber-400' : 'text-emerald-400'}>
              {renderStatus(conversation)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="destructive" onClick={() => onCancel(conversation)}>
            <Ban className="mr-1 size-4" />
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => onSend(conversation)}>
            <SendHorizonal className="mr-1 size-4" />
            Enviar Follow-up
          </Button>
          <Button
            render={
              <Link href={`/desk?client_id=${clientId}&conversation_id=${conversation.conversation_id}`} />
            }
          >
            <ArrowUpRight className="mr-1 size-4" />
            Abrir
          </Button>
        </div>
      </div>
    </article>
  )
}
