'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

export function HandoffSection({ config, onChange }: SectionProps) {
  const keywords = config.handoff_keywords ?? []
  const keywordsString = keywords.join(', ')

  function handleKeywordsChange(value: string) {
    const parsed = value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    onChange({ handoff_keywords: parsed })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure quando a conversa deve ser transferida para um atendente
        humano.
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id="handoff_on_negative_sentiment"
            checked={config.handoff_on_negative_sentiment ?? true}
            onCheckedChange={(checked) =>
              onChange({ handoff_on_negative_sentiment: !!checked })
            }
          />
          <Label htmlFor="handoff_on_negative_sentiment">
            Transferir quando detectar sentimento negativo
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="handoff_on_medical_urgency"
            checked={config.handoff_on_medical_urgency ?? true}
            onCheckedChange={(checked) =>
              onChange({ handoff_on_medical_urgency: !!checked })
            }
          />
          <Label htmlFor="handoff_on_medical_urgency">
            Transferir em caso de urgência médica
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="handoff_on_unknown_intent"
            checked={config.handoff_on_unknown_intent ?? false}
            onCheckedChange={(checked) =>
              onChange({ handoff_on_unknown_intent: !!checked })
            }
          />
          <Label htmlFor="handoff_on_unknown_intent">
            Transferir se não entender após 2 tentativas
          </Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="handoff_max_ai_turns">
          Máximo de turnos de IA antes de forçar handoff
        </Label>
        <Input
          id="handoff_max_ai_turns"
          type="number"
          min={1}
          value={config.handoff_max_ai_turns ?? 20}
          onChange={(e) =>
            onChange({
              handoff_max_ai_turns: parseInt(e.target.value) || 20,
            })
          }
          className="max-w-32"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="handoff_keywords">
          Palavras-chave para handoff imediato
        </Label>
        <Input
          id="handoff_keywords"
          placeholder="reclamação, ouvidoria, falar com humano, atendente"
          value={keywordsString}
          onChange={(e) => handleKeywordsChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Separe as palavras por vírgula. Se o paciente usar qualquer uma
          dessas palavras, a conversa será transferida imediatamente.
        </p>
      </div>
    </div>
  )
}
