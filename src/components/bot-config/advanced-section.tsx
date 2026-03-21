'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

export function AdvancedSection({ config, onChange }: SectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configurações avançadas do Chatwoot. Modifique apenas se necessário.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="chatwoot_auto_resolve_hours">
            Auto-resolver conversa após (horas)
          </Label>
          <Input
            id="chatwoot_auto_resolve_hours"
            type="number"
            min={1}
            value={config.chatwoot_auto_resolve_hours ?? 24}
            onChange={(e) =>
              onChange({
                chatwoot_auto_resolve_hours: parseInt(e.target.value) || 24,
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Resolve automaticamente conversas sem atividade.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="chatwoot_assign_to_agent_id">
            ID do agente padrão no Chatwoot
          </Label>
          <Input
            id="chatwoot_assign_to_agent_id"
            type="number"
            min={1}
            placeholder="Não atribuir automaticamente"
            value={config.chatwoot_assign_to_agent_id ?? ''}
            onChange={(e) =>
              onChange({
                chatwoot_assign_to_agent_id: e.target.value
                  ? parseInt(e.target.value)
                  : null,
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Conversas de handoff serão atribuídas a este agente.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="chatwoot_working_hours_enabled"
          checked={config.chatwoot_working_hours_enabled ?? true}
          onCheckedChange={(checked) =>
            onChange({ chatwoot_working_hours_enabled: !!checked })
          }
        />
        <Label htmlFor="chatwoot_working_hours_enabled">
          Sincronizar horários de atendimento com o Chatwoot
        </Label>
      </div>
    </div>
  )
}
