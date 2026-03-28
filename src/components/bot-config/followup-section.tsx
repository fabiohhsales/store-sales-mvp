'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

function VariableHint({ extra }: { extra?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Variáveis disponíveis: {'{patient_name}'}, {'{professional_name}'}, {'{business_name}'}
      {extra && <>, {extra}</>}
    </p>
  )
}

function TemplateField({
  label,
  id,
  value,
  disabled,
  onChange,
}: {
  label: string
  id: string
  value: string | null | undefined
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        placeholder="Deixe vazio para usar o template padrão"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || '')}
        disabled={disabled}
      />
    </div>
  )
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

        <h4 className="text-sm font-medium pt-2">Mensagens adicionais</h4>
        <VariableHint extra={'{date}, {time}, {day_of_week}, {meet_link}'} />

        <div className="grid gap-4">
          <TemplateField
            label="Mensagem D-2 (2 dias antes, 12h)"
            id="agendado_followup_msg_d2"
            value={config.agendado_followup_msg_d2}
            disabled={!(config.followup_enabled ?? true)}
            onChange={(v) => onChange({ agendado_followup_msg_d2: v || null })}
          />
          <TemplateField
            label="Mensagem 3h antes"
            id="agendado_followup_msg_minus3h"
            value={config.agendado_followup_msg_minus3h}
            disabled={!(config.followup_enabled ?? true)}
            onChange={(v) => onChange({ agendado_followup_msg_minus3h: v || null })}
          />
          <TemplateField
            label="Mensagem 5min antes"
            id="agendado_followup_msg_minus5min"
            value={config.agendado_followup_msg_minus5min}
            disabled={!(config.followup_enabled ?? true)}
            onChange={(v) => onChange({ agendado_followup_msg_minus5min: v || null })}
          />
        </div>
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
          Cadência: D+1, D+2, D+3, D+5, D+7.
        </p>

        <VariableHint />

        <div className="grid gap-4">
          <TemplateField
            label="D+1 (12–36h)"
            id="lead_followup_msg_d1"
            value={config.lead_followup_msg_d1}
            disabled={!(config.lead_followup_enabled ?? false)}
            onChange={(v) => onChange({ lead_followup_msg_d1: v || null })}
          />
          <TemplateField
            label="D+2 (36–60h)"
            id="lead_followup_msg_d2"
            value={config.lead_followup_msg_d2}
            disabled={!(config.lead_followup_enabled ?? false)}
            onChange={(v) => onChange({ lead_followup_msg_d2: v || null })}
          />
          <TemplateField
            label="D+3 (60–84h)"
            id="lead_followup_msg_d3"
            value={config.lead_followup_msg_d3}
            disabled={!(config.lead_followup_enabled ?? false)}
            onChange={(v) => onChange({ lead_followup_msg_d3: v || null })}
          />
          <TemplateField
            label="D+5 (108–132h)"
            id="lead_followup_msg_d5"
            value={config.lead_followup_msg_d5}
            disabled={!(config.lead_followup_enabled ?? false)}
            onChange={(v) => onChange({ lead_followup_msg_d5: v || null })}
          />
          <TemplateField
            label="D+7 (156–180h)"
            id="lead_followup_msg_d7"
            value={config.lead_followup_msg_d7}
            disabled={!(config.lead_followup_enabled ?? false)}
            onChange={(v) => onChange({ lead_followup_msg_d7: v || null })}
          />
        </div>
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
          respondeu. Cadência: D+1, D+2, D+4, D+7, D+10.
        </p>

        <VariableHint />

        <div className="grid gap-4">
          <TemplateField
            label="D+1 (12–36h)"
            id="atendimento_followup_msg_d1"
            value={config.atendimento_followup_msg_d1}
            disabled={!(config.atendimento_followup_enabled ?? false)}
            onChange={(v) => onChange({ atendimento_followup_msg_d1: v || null })}
          />
          <TemplateField
            label="D+2 (36–60h)"
            id="atendimento_followup_msg_d2"
            value={config.atendimento_followup_msg_d2}
            disabled={!(config.atendimento_followup_enabled ?? false)}
            onChange={(v) => onChange({ atendimento_followup_msg_d2: v || null })}
          />
          <TemplateField
            label="D+4 (84–108h)"
            id="atendimento_followup_msg_d4"
            value={config.atendimento_followup_msg_d4}
            disabled={!(config.atendimento_followup_enabled ?? false)}
            onChange={(v) => onChange({ atendimento_followup_msg_d4: v || null })}
          />
          <TemplateField
            label="D+7 (156–180h)"
            id="atendimento_followup_msg_d7"
            value={config.atendimento_followup_msg_d7}
            disabled={!(config.atendimento_followup_enabled ?? false)}
            onChange={(v) => onChange({ atendimento_followup_msg_d7: v || null })}
          />
          <TemplateField
            label="D+10 (228–252h)"
            id="atendimento_followup_msg_d10"
            value={config.atendimento_followup_msg_d10}
            disabled={!(config.atendimento_followup_enabled ?? false)}
            onChange={(v) => onChange({ atendimento_followup_msg_d10: v || null })}
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
