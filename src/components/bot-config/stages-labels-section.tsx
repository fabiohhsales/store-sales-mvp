'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizeStageSlug } from '@/lib/bot/stage-labels'
import type { PanelBotConfig, StageLabelConfig } from '@/types/database'
import { PlusIcon, TrashIcon } from 'lucide-react'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

const EMPTY_STAGE: StageLabelConfig = {
  slug: '',
  display_name: '',
  followup_cadence: null,
}

const FOLLOWUP_CADENCE_OPTIONS: Array<{
  value: NonNullable<StageLabelConfig['followup_cadence']>
  label: string
}> = [
  { value: 'lead', label: 'Lead' },
  { value: 'atendimento', label: 'Em Atendimento' },
  { value: 'agendado', label: 'Agendado' },
]

export function StagesLabelsSection({ config, onChange }: SectionProps) {
  const stageLabels = config.stage_labels ?? []

  function updateStage(index: number, updates: Partial<StageLabelConfig>) {
    const updated = stageLabels.map((item, i) => (i === index ? { ...item, ...updates } : item))
    onChange({ stage_labels: updated })
  }

  function addStage() {
    onChange({ stage_labels: [...stageLabels, { ...EMPTY_STAGE }] })
  }

  function removeStage(index: number) {
    onChange({ stage_labels: stageLabels.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Defina as etapas do funil do cliente. O slug é o nome técnico usado pelo bot e no Chatwoot.
      </p>

      {stageLabels.map((stage, index) => (
        <div key={index} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Etapa {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeStage(index)}
              disabled={stageLabels.length <= 1}
              title={stageLabels.length <= 1 ? 'É necessário ter ao menos uma etapa' : 'Remover etapa'}
            >
              <TrashIcon className="size-4 text-destructive" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`stage-display-${index}`}>Nome amigável</Label>
              <Input
                id={`stage-display-${index}`}
                placeholder="Triagem"
                value={stage.display_name}
                onChange={(e) => {
                  const displayName = e.target.value
                  const nextSlug = stage.slug ? stage.slug : normalizeStageSlug(displayName)
                  updateStage(index, { display_name: displayName, slug: nextSlug })
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`stage-slug-${index}`}>Slug técnico</Label>
              <Input
                id={`stage-slug-${index}`}
                placeholder="etapa_triagem"
                value={stage.slug}
                onChange={(e) => updateStage(index, { slug: normalizeStageSlug(e.target.value) })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Vínculo com Follow-up</Label>
              <Select
                value={stage.followup_cadence ?? 'none'}
                onValueChange={(value) =>
                  updateStage(index, {
                    followup_cadence: value === 'none' ? null : (value as NonNullable<StageLabelConfig['followup_cadence']>),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sem vínculo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo (ignorar nos follow-ups)</SelectItem>
                  {FOLLOWUP_CADENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addStage}>
        <PlusIcon className="mr-2 size-4" />
        Adicionar etapa
      </Button>
    </div>
  )
}
