'use client'

import { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { FollowupStepCard, type StepCardData } from './followup-step-card'
import type {
  PanelBotConfig,
  FollowupStepConfig,
  AgendadoFollowupStepConfig,
} from '@/types/database'
import {
  DEFAULT_LEAD_STEPS,
  DEFAULT_ATENDIMENTO_STEPS,
  DEFAULT_AGENDADO_STEPS,
} from '@/lib/followup/shared'

type CadenceType = 'lead' | 'atendimento' | 'agendado'

interface Props {
  cadence: CadenceType
  config: Partial<PanelBotConfig>
  disabled: boolean
  onChange: (updates: Partial<PanelBotConfig>) => void
}

// Legacy field mapping for building initial state from old config
const LEGACY_LEAD_FIELDS: Record<string, keyof PanelBotConfig> = {
  lead_D1: 'lead_followup_msg_d1',
  lead_D2: 'lead_followup_msg_d2',
  lead_D3: 'lead_followup_msg_d3',
  lead_D5: 'lead_followup_msg_d5',
  lead_D7: 'lead_followup_msg_d7',
}

const LEGACY_ATENDIMENTO_FIELDS: Record<string, keyof PanelBotConfig> = {
  atendimento_D1: 'atendimento_followup_msg_d1',
  atendimento_D2: 'atendimento_followup_msg_d2',
  atendimento_D4: 'atendimento_followup_msg_d4',
  atendimento_D7: 'atendimento_followup_msg_d7',
  atendimento_D10: 'atendimento_followup_msg_d10',
}

const LEGACY_AGENDADO_FIELDS: Record<string, keyof PanelBotConfig> = {
  'agendado_D-2_12h': 'agendado_followup_msg_d2',
  'agendado_-3h': 'agendado_followup_msg_minus3h',
  'agendado_-5min': 'agendado_followup_msg_minus5min',
}

function toCardData(step: FollowupStepConfig): StepCardData {
  return {
    step_key: step.step_key,
    label: step.label,
    template: step.template,
    enabled: step.enabled,
    min_hours: step.min_hours,
    max_hours: step.max_hours,
  }
}

function toCardDataAgendado(step: AgendadoFollowupStepConfig): StepCardData {
  return {
    step_key: step.step_key,
    label: step.label,
    template: step.template,
    enabled: step.enabled,
    min_hours_before: step.min_hours_before,
    max_hours_before: step.max_hours_before,
  }
}

function fromCardData(card: StepCardData): FollowupStepConfig {
  return {
    step_key: card.step_key,
    label: card.label,
    template: card.template,
    enabled: card.enabled,
    min_hours: card.min_hours ?? 0,
    max_hours: card.max_hours ?? 0,
  }
}

function fromCardDataAgendado(card: StepCardData): AgendadoFollowupStepConfig {
  return {
    step_key: card.step_key,
    label: card.label,
    template: card.template,
    enabled: card.enabled,
    min_hours_before: card.min_hours_before ?? 0,
    max_hours_before: card.max_hours_before ?? 0,
  }
}

function buildInitialSteps(cadence: CadenceType, config: Partial<PanelBotConfig>): StepCardData[] {
  if (cadence === 'lead') {
    const jsonb = config.lead_followup_steps
    if (Array.isArray(jsonb) && jsonb.length > 0) return jsonb.map(toCardData)
    return DEFAULT_LEAD_STEPS.map((step) => {
      const field = LEGACY_LEAD_FIELDS[step.step_key]
      const legacy = field ? (config[field] as string | null) : null
      return toCardData({ ...step, template: legacy?.trim() || step.template })
    })
  }

  if (cadence === 'atendimento') {
    const jsonb = config.atendimento_followup_steps
    if (Array.isArray(jsonb) && jsonb.length > 0) return jsonb.map(toCardData)
    return DEFAULT_ATENDIMENTO_STEPS.map((step) => {
      const field = LEGACY_ATENDIMENTO_FIELDS[step.step_key]
      const legacy = field ? (config[field] as string | null) : null
      return toCardData({ ...step, template: legacy?.trim() || step.template })
    })
  }

  // agendado
  const jsonb = config.agendado_followup_steps
  if (Array.isArray(jsonb) && jsonb.length > 0) return jsonb.map(toCardDataAgendado)
  return DEFAULT_AGENDADO_STEPS.map((step) => {
    const field = LEGACY_AGENDADO_FIELDS[step.step_key]
    const legacy = field ? (config[field] as string | null) : null
    return toCardDataAgendado({ ...step, template: legacy?.trim() || step.template })
  })
}

const VARIABLE_HINTS: Record<CadenceType, string> = {
  lead: '{patient_name}, {professional_name}, {business_name}',
  atendimento: '{patient_name}, {professional_name}, {business_name}',
  agendado: '{patient_name}, {professional_name}, {business_name}, {date}, {time}, {day_of_week}, {meet_link}',
}

const JSONB_FIELDS: Record<CadenceType, keyof PanelBotConfig> = {
  lead: 'lead_followup_steps',
  atendimento: 'atendimento_followup_steps',
  agendado: 'agendado_followup_steps',
}

export function FollowupStepsList({ cadence, config, disabled, onChange }: Props) {
  const steps = useMemo(() => buildInitialSteps(cadence, config), [cadence, config])
  const mode = cadence === 'agendado' ? 'before' : 'delay'

  const persist = useCallback(
    (updated: StepCardData[]) => {
      const field = JSONB_FIELDS[cadence]
      if (cadence === 'agendado') {
        onChange({ [field]: updated.map(fromCardDataAgendado) } as Partial<PanelBotConfig>)
      } else {
        onChange({ [field]: updated.map(fromCardData) } as Partial<PanelBotConfig>)
      }
    },
    [cadence, onChange]
  )

  const handleChange = useCallback(
    (index: number, updated: StepCardData) => {
      const next = [...steps]
      next[index] = updated
      persist(next)
    },
    [steps, persist]
  )

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const next = [...steps]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      persist(next)
    },
    [steps, persist]
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= steps.length - 1) return
      const next = [...steps]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      persist(next)
    },
    [steps, persist]
  )

  const handleDelete = useCallback(
    (index: number) => {
      if (steps.length <= 1) return
      const next = steps.filter((_, i) => i !== index)
      persist(next)
    },
    [steps, persist]
  )

  const handleAdd = useCallback(() => {
    const suffix = steps.length + 1
    const newStep: StepCardData = {
      step_key: `${cadence}_custom_${suffix}`,
      label: `Step ${suffix}`,
      template: '',
      enabled: true,
      ...(mode === 'before'
        ? { min_hours_before: 0, max_hours_before: 1 }
        : { min_hours: 0, max_hours: 24 }),
    }
    persist([...steps, newStep])
  }, [cadence, mode, steps, persist])

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <FollowupStepCard
          key={step.step_key}
          step={step}
          index={index}
          total={steps.length}
          disabled={disabled}
          mode={mode}
          variableHint={VARIABLE_HINTS[cadence]}
          onChange={(updated) => handleChange(index, updated)}
          onMoveUp={() => handleMoveUp(index)}
          onMoveDown={() => handleMoveDown(index)}
          onDelete={() => handleDelete(index)}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={disabled}
        className="w-full"
      >
        <Plus size={14} className="mr-1.5" /> Adicionar step
      </Button>
    </div>
  )
}
