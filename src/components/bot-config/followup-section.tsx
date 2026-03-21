'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

export function FollowupSection({ config, onChange }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch
          id="followup_enabled"
          checked={config.followup_enabled ?? true}
          onCheckedChange={(checked) =>
            onChange({ followup_enabled: !!checked })
          }
        />
        <Label htmlFor="followup_enabled">
          Ativar pipeline de follow-up
        </Label>
      </div>

      <p className="text-sm text-muted-foreground">
        O follow-up envia confirmações e lembretes automáticos para os pacientes
        antes das consultas.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="followup_confirmation_hours_before">
            Confirmação (horas antes)
          </Label>
          <Input
            id="followup_confirmation_hours_before"
            type="number"
            min={1}
            value={config.followup_confirmation_hours_before ?? 24}
            onChange={(e) =>
              onChange({
                followup_confirmation_hours_before:
                  parseInt(e.target.value) || 24,
              })
            }
            disabled={!(config.followup_enabled ?? true)}
          />
          <p className="text-xs text-muted-foreground">
            Envia mensagem de confirmação X horas antes da consulta.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="followup_reminder_hours_before">
            Lembrete (horas antes)
          </Label>
          <Input
            id="followup_reminder_hours_before"
            type="number"
            min={1}
            value={config.followup_reminder_hours_before ?? 2}
            onChange={(e) =>
              onChange({
                followup_reminder_hours_before:
                  parseInt(e.target.value) || 2,
              })
            }
            disabled={!(config.followup_enabled ?? true)}
          />
          <p className="text-xs text-muted-foreground">
            Envia lembrete X horas antes da consulta.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="followup_noshow_enabled"
          checked={config.followup_noshow_enabled ?? true}
          onCheckedChange={(checked) =>
            onChange({ followup_noshow_enabled: !!checked })
          }
          disabled={!(config.followup_enabled ?? true)}
        />
        <Label htmlFor="followup_noshow_enabled">
          Ativar gestão de no-show
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Envia mensagem automaticamente quando o paciente não comparece.
      </p>
    </div>
  )
}
