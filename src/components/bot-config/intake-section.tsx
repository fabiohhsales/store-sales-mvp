'use client'

import { Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PanelBotConfig, IntakeFieldConfig } from '@/types/database'

interface Props {
  config: Partial<PanelBotConfig>
  onChange: (patch: Partial<PanelBotConfig>) => void
}

const DEFAULT_FIELDS: IntakeFieldConfig[] = [
  { key: 'full_name',       label: 'Full name',               required: true  },
  { key: 'email',           label: 'Email address',           required: true  },
  { key: 'date_of_birth',   label: 'Date of birth',           required: false },
  { key: 'country',         label: 'Country',                 required: true  },
  { key: 'referral_source', label: 'How did you hear about us', required: false },
  { key: 'medications',     label: 'Any medications',         required: false },
]

export function IntakeSection({ config, onChange }: Props) {
  const fields = (config.intake_fields as IntakeFieldConfig[] | null) ?? []
  const enabled = config.intake_enabled ?? false

  function setFields(newFields: IntakeFieldConfig[]) {
    onChange({ intake_fields: newFields })
  }

  function addField() {
    setFields([...fields, { key: `campo_${fields.length + 1}`, label: 'Novo campo', required: false }])
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx))
  }

  function updateField(idx: number, patch: Partial<IntakeFieldConfig>) {
    setFields(fields.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  function loadDefaults() {
    setFields(DEFAULT_FIELDS)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Intake ativo</Label>
          <p className="text-xs text-muted-foreground">Bot coleta dados do paciente antes de qualquer ação</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onChange({ intake_enabled: v })}
        />
      </div>

      {enabled && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Campos a coletar</Label>
              <button
                type="button"
                onClick={loadDefaults}
                className="text-xs text-primary underline underline-offset-2"
              >
                Usar padrão ChoiExpert
              </button>
            </div>

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhum campo configurado.</p>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <GripVertical size={14} className="text-muted-foreground flex-shrink-0" />
                  <Input
                    value={field.key}
                    onChange={(e) => updateField(idx, { key: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                    placeholder="chave_do_campo"
                    className="h-7 text-xs font-mono w-36 flex-shrink-0"
                  />
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                    placeholder="Pergunta para o paciente"
                    className="h-7 text-xs flex-1"
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(v) => updateField(idx, { required: v })}
                    />
                    <span className="text-xs text-muted-foreground w-16">{field.required ? 'Obrig.' : 'Opcional'}</span>
                  </div>
                  <button type="button" onClick={() => removeField(idx)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addField} className="h-7 text-xs">
              <Plus size={12} className="mr-1" />
              Adicionar campo
            </Button>
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Pedir fotos após intake</Label>
                <p className="text-xs text-muted-foreground">Bot solicita fotos ao finalizar coleta de dados</p>
              </div>
              <Switch
                checked={config.intake_request_photos ?? false}
                onCheckedChange={(v) => onChange({ intake_request_photos: v })}
              />
            </div>

            {config.intake_request_photos && (
              <>
                <div className="flex items-center gap-3">
                  <Label className="w-40 text-xs">Número de fotos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={config.intake_photos_count ?? 5}
                    onChange={(e) => onChange({ intake_photos_count: parseInt(e.target.value) || 5 })}
                    className="h-7 text-xs w-20"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Handoff automático após fotos</Label>
                    <p className="text-xs text-muted-foreground">Transfere para operador ao receber todas as fotos</p>
                  </div>
                  <Switch
                    checked={config.intake_handoff_after_photos ?? true}
                    onCheckedChange={(v) => onChange({ intake_handoff_after_photos: v })}
                  />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
