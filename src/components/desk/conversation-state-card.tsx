'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react'
import {
  deriveConductionMode,
  conductionLabel,
  conductionBadgeVariant,
  STAGE_LABELS,
  relativeTime,
} from '@/lib/desk/conduction'

interface Props {
  stage: string
  stageChangedAt: string | null
  intakeCompletedAt: string | null
  customDataKeyCount: number
  lastIncomingAt: string | null
  lastOutgoingAt: string | null
  journeyStage?: string | null
  handoffReason?: string | null
  handoffWaitMinutes?: number | null
}

export function ConversationStateCard({
  stage,
  stageChangedAt,
  intakeCompletedAt,
  customDataKeyCount,
  lastIncomingAt,
  lastOutgoingAt,
  journeyStage,
  handoffReason,
  handoffWaitMinutes,
}: Props) {
  // Live timer for "time in stage"
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const conduction = deriveConductionMode(stage)
  const intakeStatus = intakeCompletedAt
    ? { label: 'Concluído', classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
    : customDataKeyCount > 0
      ? { label: 'Em andamento', classes: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' }
      : { label: 'Pendente', classes: 'border-border text-muted-foreground' }

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant={conductionBadgeVariant(conduction)} className="text-xs px-2 py-0.5">
          {conductionLabel(conduction)}
        </Badge>
        <div className="flex items-center gap-1.5">
          {journeyStage && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-500/30 bg-blue-500/10 text-blue-400">
              {journeyStage}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{STAGE_LABELS[stage] ?? stage}</span>
        </div>
      </div>

      {handoffReason && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-2 py-1 leading-snug">
          Motivo do handoff: {handoffReason}
        </p>
      )}

      {handoffWaitMinutes != null && (
        <p className={`text-[11px] rounded px-2 py-1 leading-snug ${
          handoffWaitMinutes > 30
            ? 'text-red-600 dark:text-red-400 bg-red-500/10'
            : 'text-muted-foreground bg-muted/50'
        }`}>
          Tempo de espera para atendimento: {handoffWaitMinutes < 60
            ? `${handoffWaitMinutes} min`
            : `${Math.floor(handoffWaitMinutes / 60)}h${handoffWaitMinutes % 60 > 0 ? ` ${handoffWaitMinutes % 60}min` : ''}`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground block">Intake</span>
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 mt-0.5 ${intakeStatus.classes}`}>
            {intakeStatus.label}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground block">Tempo no stage</span>
          <div className="flex items-center gap-1 mt-0.5 text-foreground/80">
            <Clock size={11} />
            {relativeTime(stageChangedAt) || '—'}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground block">Última recebida</span>
          <div className="flex items-center gap-1 mt-0.5 text-foreground/80">
            <ArrowDownLeft size={11} />
            {relativeTime(lastIncomingAt) || '—'}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground block">Última enviada</span>
          <div className="flex items-center gap-1 mt-0.5 text-foreground/80">
            <ArrowUpRight size={11} />
            {relativeTime(lastOutgoingAt) || '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
