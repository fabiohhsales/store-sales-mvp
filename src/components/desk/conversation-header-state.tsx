'use client'

import { useState, useEffect } from 'react'
import { UserCheck, Bot, CheckCheck, Loader2, UserRound, CalendarSearch, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  deriveConductionMode,
  conductionLabel,
  conductionBadgeVariant,
  relativeTime,
  slaColor,
  slaBadgeClasses,
} from '@/lib/desk/conduction'

interface OperatorOption {
  id: string
  email: string
  display_name: string | null
}

interface Props {
  contactName: string | null
  contactPhone: string | null
  conversationId: string
  stage: string
  stageChangedAt: string | null
  assignedOperatorId: string | null
  currentUserId: string | null
  operators: OperatorOption[]
  assignLoading: boolean
  actioning: boolean
  checkingAvailability: boolean
  labels: string[]
  onAction: (action: 'assume' | 'return' | 'resolve') => void
  onAssign: (operatorId: string | null) => void
  onAvailabilitySearch: () => void
  onOpenProfile: () => void
}

export function ConversationHeaderState({
  contactName,
  contactPhone,
  conversationId,
  stage,
  stageChangedAt,
  assignedOperatorId,
  currentUserId,
  operators,
  assignLoading,
  actioning,
  checkingAvailability,
  labels,
  onAction,
  onAssign,
  onAvailabilitySearch,
  onOpenProfile,
}: Props) {
  // Live SLA timer — re-renders every 30s without re-fetching
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const conduction = deriveConductionMode(stage)
  const canAssume = stage === 'awaiting_human' || stage === 'bot_triage'
  const canReturn = stage === 'in_service'
  const canSend = stage === 'in_service'
  const isResolved = stage === 'resolved'
  const isAssignedToMe = !!(currentUserId && assignedOperatorId === currentUserId)

  const sla = slaColor(stageChangedAt)
  const displayName = contactName || contactPhone || 'Desconhecido'
  const shortId = conversationId.slice(0, 8)

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5 border-b border-border bg-card/30 flex-shrink-0">
      {/* Line 1: Identity + Conduction + SLA + Assignment */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{displayName}</span>
          <span className="text-[10px] text-muted-foreground font-mono">#{shortId}</span>
          <Badge variant={conductionBadgeVariant(conduction)} className="text-[10px] h-5 px-1.5">
            {conductionLabel(conduction)}
          </Badge>
          {isAssignedToMe && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400">
              Voc&ecirc;
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* SLA timer */}
          {stageChangedAt && !isResolved && (
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 gap-1 ${slaBadgeClasses(sla)}`}>
              <Clock className="size-3" />
              {relativeTime(stageChangedAt)}
            </Badge>
          )}

          {/* Operator assignment */}
          {operators.length > 0 && (
            <Select
              value={assignedOperatorId && operators.some((op) => op.id === assignedOperatorId) ? assignedOperatorId : 'none'}
              onValueChange={(val) => onAssign(val === 'none' ? null : val)}
              disabled={assignLoading}
            >
              <SelectTrigger className="h-7 w-44 text-xs border-dashed">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs text-muted-foreground">
                  Sem responsável
                </SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id} className="text-xs">
                    {op.display_name ?? op.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Line 2: Labels + Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {labels.length > 0 && (
            <span className="text-xs text-muted-foreground">{labels.join(', ')}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs lg:hidden"
            onClick={onOpenProfile}
          >
            <UserRound size={12} className="mr-1" />
            Contato
          </Button>

          {canAssume && (
            <Button size="sm" onClick={() => onAction('assume')} disabled={actioning} className="h-7 text-xs">
              {actioning ? <Loader2 size={12} className="mr-1 animate-spin" /> : <UserCheck size={12} className="mr-1" />}
              Assumir
            </Button>
          )}

          {canReturn && (
            <Button size="sm" variant="outline" onClick={() => onAction('return')} disabled={actioning}
              className="h-7 text-xs border-orange-500/40 text-orange-500 hover:bg-orange-500/10">
              {actioning ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Bot size={12} className="mr-1" />}
              Devolver ao bot
            </Button>
          )}

          {canSend && (
            <Button size="sm" variant="outline" onClick={onAvailabilitySearch} disabled={checkingAvailability}
              className="h-7 text-xs">
              {checkingAvailability ? <Loader2 size={12} className="mr-1 animate-spin" /> : <CalendarSearch size={12} className="mr-1" />}
              Disponibilidades
            </Button>
          )}

          {!isResolved && (
            <Dialog>
              <DialogTrigger render={<Button size="sm" variant="outline" disabled={actioning} className="h-7 text-xs" />}>
                <CheckCheck size={12} className="mr-1" />
                Finalizar
              </DialogTrigger>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>Finalizar conversa?</DialogTitle>
                  <DialogDescription>
                    A conversa será marcada como resolvida e o bot não responderá mais.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                  <DialogClose render={<Button onClick={() => onAction('resolve')} />}>Finalizar</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  )
}
