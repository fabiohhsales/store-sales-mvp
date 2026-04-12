'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FollowupStepsList } from './followup-steps-list'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

export function FollowupSection({ config, onChange }: SectionProps) {
  return (
    <Tabs defaultValue={0} className="space-y-4">
      <TabsList>
        <TabsTrigger value={0}>Agendado</TabsTrigger>
        <TabsTrigger value={1}>Lead</TabsTrigger>
        <TabsTrigger value={2}>Em Atendimento</TabsTrigger>
      </TabsList>

      {/* ── Tab Agendado ── */}
      <TabsContent value={0} className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="followup_enabled"
            checked={config.followup_enabled ?? true}
            onCheckedChange={(checked) =>
              onChange({ followup_enabled: !!checked })
            }
          />
          <Label htmlFor="followup_enabled">
            Ativar pipeline de follow-up (agendado)
          </Label>
        </div>

        <p className="text-sm text-muted-foreground">
          Envia confirmações e lembretes automáticos antes das consultas.
          Cada step dispara numa janela de horas antes do horário marcado.
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

        <h4 className="text-sm font-medium pt-2">Steps de mensagem</h4>
        <FollowupStepsList
          cadence="agendado"
          config={config}
          disabled={!(config.followup_enabled ?? true)}
          onChange={onChange}
        />
      </TabsContent>

      {/* ── Tab Lead ── */}
      <TabsContent value={1} className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="lead_followup_enabled"
            checked={config.lead_followup_enabled ?? false}
            onCheckedChange={(checked) =>
              onChange({ lead_followup_enabled: !!checked })
            }
          />
          <Label htmlFor="lead_followup_enabled">
            Ativar cadência de Lead
          </Label>
        </div>

        <p className="text-sm text-muted-foreground">
          Reenvia mensagens para leads que não responderam após o bot falar.
          Configure os steps abaixo com o timing e a mensagem desejados.
        </p>

        <FollowupStepsList
          cadence="lead"
          config={config}
          disabled={!(config.lead_followup_enabled ?? false)}
          onChange={onChange}
        />
      </TabsContent>

      {/* ── Tab Em Atendimento ── */}
      <TabsContent value={2} className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="atendimento_followup_enabled"
            checked={config.atendimento_followup_enabled ?? false}
            onCheckedChange={(checked) =>
              onChange({ atendimento_followup_enabled: !!checked })
            }
          />
          <Label htmlFor="atendimento_followup_enabled">
            Ativar cadência Em Atendimento
          </Label>
        </div>

        <p className="text-sm text-muted-foreground">
          Reenvia mensagens quando o contato falou por último e o bot não
          respondeu. Configure os steps abaixo.
        </p>

        <FollowupStepsList
          cadence="atendimento"
          config={config}
          disabled={!(config.atendimento_followup_enabled ?? false)}
          onChange={onChange}
        />
      </TabsContent>
    </Tabs>
  )
}
