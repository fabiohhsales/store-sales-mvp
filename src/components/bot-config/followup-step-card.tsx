'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react'

export interface StepCardData {
  step_key: string
  label: string
  template: string
  enabled: boolean
  // For lead/atendimento (delay-based)
  min_hours?: number
  max_hours?: number
  // For agendado (appointment-relative)
  min_hours_before?: number
  max_hours_before?: number
}

interface Props {
  step: StepCardData
  index: number
  total: number
  disabled: boolean
  mode: 'delay' | 'before'
  variableHint: string
  onChange: (updated: StepCardData) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

export function FollowupStepCard({
  step,
  index,
  total,
  disabled,
  mode,
  variableHint,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  const minField = mode === 'before' ? 'min_hours_before' : 'min_hours'
  const maxField = mode === 'before' ? 'max_hours_before' : 'max_hours'
  const minVal = step[minField] ?? 0
  const maxVal = step[maxField] ?? 0
  const timeLabel = mode === 'before' ? 'horas antes da consulta' : 'horas após última msg'

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${step.enabled ? 'border-border' : 'border-border/50 opacity-60'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={step.enabled}
            onCheckedChange={(checked) => onChange({ ...step, enabled: !!checked })}
            disabled={disabled}
          />
          <Input
            value={step.label}
            onChange={(e) => onChange({ ...step, label: e.target.value })}
            disabled={disabled}
            className="h-7 w-28 text-sm font-medium"
            placeholder="Nome do step"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveUp}
            disabled={disabled || index === 0}
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveDown}
            disabled={disabled || index === total - 1}
          >
            <ChevronDown size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={disabled || total <= 1}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">De ({timeLabel})</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={minVal}
            onChange={(e) => onChange({ ...step, [minField]: parseFloat(e.target.value) || 0 })}
            disabled={disabled || !step.enabled}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Até ({timeLabel})</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={maxVal}
            onChange={(e) => onChange({ ...step, [maxField]: parseFloat(e.target.value) || 0 })}
            disabled={disabled || !step.enabled}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Template da mensagem</Label>
        <Textarea
          rows={2}
          value={step.template}
          onChange={(e) => onChange({ ...step, template: e.target.value })}
          disabled={disabled || !step.enabled}
          placeholder="Deixe vazio para usar o template padrão"
          className="text-sm"
        />
        <p className="text-[10px] text-muted-foreground">{variableHint}</p>
      </div>
    </div>
  )
}
