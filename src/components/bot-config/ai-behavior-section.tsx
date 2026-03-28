'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AiTone, PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

const TONES: { value: AiTone; label: string; description: string }[] = [
  {
    value: 'formal',
    label: 'Formal',
    description: 'Prezado(a), como posso auxiliá-lo(a)?',
  },
  {
    value: 'professional_friendly',
    label: 'Profissional e amigável',
    description: 'Olá! Como posso ajudar?',
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Oi! Tudo bem? Como posso te ajudar?',
  },
  {
    value: 'empathetic',
    label: 'Empático',
    description: 'Olá! Fico feliz em ajudar. Como você está?',
  },
]

export function AiBehaviorSection({ config, onChange }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tom da IA</Label>
          <Select
            value={config.ai_tone ?? 'professional_friendly'}
            onValueChange={(value) =>
              onChange({ ai_tone: value as AiTone })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((tone) => (
                <SelectItem key={tone.value} value={tone.value}>
                  {tone.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.ai_tone && (
            <p className="text-xs text-muted-foreground">
              Exemplo:{' '}
              {TONES.find((t) => t.value === config.ai_tone)?.description}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ai_language">Idioma</Label>
          <Input
            id="ai_language"
            value={config.ai_language ?? 'pt-BR'}
            onChange={(e) => onChange({ ai_language: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai_greeting_message">Mensagem de boas-vindas</Label>
        <Textarea
          id="ai_greeting_message"
          placeholder="Olá! Sou o assistente virtual do(a) {professional_name}. Como posso ajudar?"
          value={config.ai_greeting_message ?? ''}
          onChange={(e) => onChange({ ai_greeting_message: e.target.value })}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Enviada na primeira interação com o paciente.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai_custom_instructions">
          Instruções personalizadas
        </Label>
        <Textarea
          id="ai_custom_instructions"
          placeholder="Ex: O paciente deve ser sempre orientado a trazer exames anteriores."
          value={config.ai_custom_instructions ?? ''}
          onChange={(e) =>
            onChange({ ai_custom_instructions: e.target.value })
          }
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Instruções adicionais incluídas no prompt do AI Agent.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="process_flow_guide">
          Processo de atendimento (etapas e critérios)
        </Label>
        <Textarea
          id="process_flow_guide"
          placeholder="Ex: 1) Triagem: entender contexto. 2) Qualificação: coletar X e Y. 3) Agendamento: oferecer 2 opções."
          value={config.process_flow_guide ?? ''}
          onChange={(e) =>
            onChange({ process_flow_guide: e.target.value })
          }
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Descreve as etapas reais do cliente e os critérios de avanço/handoff por etapa.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="objections_guide">
          Objeções frequentes e resposta recomendada
        </Label>
        <Textarea
          id="objections_guide"
          placeholder="Ex: Preço alto -> reforçar valor e parcelamento. Vou pensar -> propor retorno com data."
          value={config.objections_guide ?? ''}
          onChange={(e) =>
            onChange({ objections_guide: e.target.value })
          }
          rows={4}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="qualification_questions_guide">
          Perguntas obrigatórias de qualificação
        </Label>
        <Textarea
          id="qualification_questions_guide"
          placeholder="Ex: Triagem: motivo principal, urgência, faixa de horário. Qualificação: histórico e objetivo."
          value={config.qualification_questions_guide ?? ''}
          onChange={(e) =>
            onChange({ qualification_questions_guide: e.target.value })
          }
          rows={4}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="disengagement_policy_guide">
          Política para desistência e encerramento
        </Label>
        <Textarea
          id="disengagement_policy_guide"
          placeholder="Ex: Se lead disser que não tem interesse, encerrar com empatia e não insistir em agenda."
          value={config.disengagement_policy_guide ?? ''}
          onChange={(e) =>
            onChange({ disengagement_policy_guide: e.target.value })
          }
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai_fallback_message">
          Mensagem de fallback (quando não entende)
        </Label>
        <Textarea
          id="ai_fallback_message"
          placeholder="Não consegui entender. Posso te ajudar com agendamento, reagendamento ou cancelamento?"
          value={config.ai_fallback_message ?? ''}
          onChange={(e) => onChange({ ai_fallback_message: e.target.value })}
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai_handoff_message">
          Mensagem de transferência para humano
        </Label>
        <Textarea
          id="ai_handoff_message"
          placeholder="Vou transferir para nossa equipe para melhor atendê-lo(a). Aguarde um momento."
          value={config.ai_handoff_message ?? ''}
          onChange={(e) => onChange({ ai_handoff_message: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  )
}
