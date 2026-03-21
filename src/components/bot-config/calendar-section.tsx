'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

const CALENDAR_COLORS: { value: string; label: string }[] = [
  { value: '1', label: 'Lavanda' },
  { value: '2', label: 'Sálvia' },
  { value: '3', label: 'Uva' },
  { value: '4', label: 'Flamingo' },
  { value: '5', label: 'Banana' },
  { value: '6', label: 'Tangerina' },
  { value: '7', label: 'Pavão' },
  { value: '8', label: 'Grafite' },
  { value: '9', label: 'Mirtilo' },
  { value: '10', label: 'Manjericão' },
  { value: '11', label: 'Tomate' },
]

export function CalendarSection({ config, onChange }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="calendar_event_title_template">
          Template do título do evento
        </Label>
        <Input
          id="calendar_event_title_template"
          placeholder="Consulta {service_name} — {patient_name}"
          value={config.calendar_event_title_template ?? ''}
          onChange={(e) =>
            onChange({ calendar_event_title_template: e.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Variáveis disponíveis: {'{service_name}'}, {'{patient_name}'},{' '}
          {'{professional_name}'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="calendar_event_description_template">
          Template da descrição do evento
        </Label>
        <Textarea
          id="calendar_event_description_template"
          placeholder={
            'Paciente: {patient_name}\nTelefone: {patient_phone}\nServiço: {service_name}\nAgendado via Sales Chat'
          }
          value={config.calendar_event_description_template ?? ''}
          onChange={(e) =>
            onChange({ calendar_event_description_template: e.target.value })
          }
          rows={4}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id="calendar_create_meet_link"
            checked={config.calendar_create_meet_link ?? false}
            onCheckedChange={(checked) =>
              onChange({ calendar_create_meet_link: !!checked })
            }
          />
          <Label htmlFor="calendar_create_meet_link">
            Gerar link do Google Meet automaticamente
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="calendar_send_invite_to_patient"
            checked={config.calendar_send_invite_to_patient ?? false}
            onCheckedChange={(checked) =>
              onChange({ calendar_send_invite_to_patient: !!checked })
            }
          />
          <Label htmlFor="calendar_send_invite_to_patient">
            Enviar convite por email para o paciente
          </Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Cor do evento no Google Calendar</Label>
        <Select
          value={config.calendar_color_id ?? ''}
          onValueChange={(value) =>
            onChange({ calendar_color_id: value || null })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Padrão do calendário" />
          </SelectTrigger>
          <SelectContent>
            {CALENDAR_COLORS.map((color) => (
              <SelectItem key={color.value} value={color.value}>
                {color.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
