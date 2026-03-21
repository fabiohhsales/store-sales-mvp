'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BusinessSegment, PanelBotConfig } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

const SEGMENTS: { value: BusinessSegment; label: string }[] = [
  { value: 'medicina', label: 'Medicina' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'estetica', label: 'Estética' },
  { value: 'outro', label: 'Outro' },
]

export function ProfessionalSection({ config, onChange }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="professional_name">Nome do profissional *</Label>
          <Input
            id="professional_name"
            placeholder="Dr. João Silva"
            value={config.professional_name ?? ''}
            onChange={(e) => onChange({ professional_name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="professional_title">Título / Especialidade</Label>
          <Input
            id="professional_title"
            placeholder="Médico Cardiologista"
            value={config.professional_title ?? ''}
            onChange={(e) => onChange({ professional_title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="professional_register">Registro profissional</Label>
          <Input
            id="professional_register"
            placeholder="CRM-RJ 12345"
            value={config.professional_register ?? ''}
            onChange={(e) =>
              onChange({ professional_register: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_name">Nome do negócio / clínica</Label>
          <Input
            id="business_name"
            placeholder="Clínica Coração Saudável"
            value={config.business_name ?? ''}
            onChange={(e) => onChange({ business_name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Segmento</Label>
          <Select
            value={config.business_segment ?? ''}
            onValueChange={(value) =>
              onChange({ business_segment: value as BusinessSegment })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o segmento" />
            </SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((seg) => (
                <SelectItem key={seg.value} value={seg.value}>
                  {seg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_phone">Telefone comercial</Label>
          <Input
            id="business_phone"
            placeholder="(21) 3456-7890"
            value={config.business_phone ?? ''}
            onChange={(e) => onChange({ business_phone: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_address">Endereço</Label>
        <Input
          id="business_address"
          placeholder="Rua das Flores, 123 — Centro, Rio de Janeiro"
          value={config.business_address ?? ''}
          onChange={(e) => onChange({ business_address: e.target.value })}
        />
      </div>
    </div>
  )
}
