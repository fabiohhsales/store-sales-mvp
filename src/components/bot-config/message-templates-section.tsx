'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

const AVAILABLE_VARIABLES = [
  '{patient_name}',
  '{patient_phone}',
  '{professional_name}',
  '{professional_title}',
  '{business_name}',
  '{service_name}',
  '{date}',
  '{time}',
  '{day_of_week}',
  '{working_hours_summary}',
  '{meet_link}',
]

export function MessageTemplatesSection({ config, onChange }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/50 p-3">
        <p className="mb-1.5 text-xs font-medium">Variáveis disponíveis:</p>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABLE_VARIABLES.map((v) => (
            <code
              key={v}
              className="rounded bg-muted px-1.5 py-0.5 text-xs"
            >
              {v}
            </code>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="msg_confirmation">
          Mensagem de confirmação
        </Label>
        <Textarea
          id="msg_confirmation"
          placeholder="Olá {patient_name}! Lembramos da sua consulta com {professional_name} amanhã às {time}. Pode confirmar? Responda SIM ou NÃO."
          value={config.msg_confirmation ?? ''}
          onChange={(e) => onChange({ msg_confirmation: e.target.value })}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="msg_reminder">Mensagem de lembrete</Label>
        <Textarea
          id="msg_reminder"
          placeholder="Olá {patient_name}! Sua consulta com {professional_name} é daqui a 2 horas, às {time}. Aguardamos você!"
          value={config.msg_reminder ?? ''}
          onChange={(e) => onChange({ msg_reminder: e.target.value })}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="msg_noshow">Mensagem de no-show</Label>
        <Textarea
          id="msg_noshow"
          placeholder="Olá {patient_name}, notamos que você não compareceu à consulta. Gostaria de reagendar?"
          value={config.msg_noshow ?? ''}
          onChange={(e) => onChange({ msg_noshow: e.target.value })}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="msg_outside_hours">
          Mensagem fora do horário de atendimento
        </Label>
        <Textarea
          id="msg_outside_hours"
          placeholder="Obrigado pelo contato! Nosso horário de atendimento é {working_hours_summary}. Retornaremos assim que possível."
          value={config.msg_outside_hours ?? ''}
          onChange={(e) => onChange({ msg_outside_hours: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  )
}
