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
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import type { PanelBotConfig, ServiceConfig, ServiceModality } from '@/types/database'
import { PlusIcon, TrashIcon } from 'lucide-react'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

const MODALITIES: { value: ServiceModality; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'teleconsulta', label: 'Teleconsulta' },
  { value: 'ambos', label: 'Ambos' },
]

const DEFAULT_SERVICE: ServiceConfig = {
  name: '',
  duration_minutes: 60,
  modality: 'presencial',
  price: null,
  active: true,
}

export function ServicesSection({ config, onChange }: SectionProps) {
  const services = config.services ?? []

  function updateService(index: number, updates: Partial<ServiceConfig>) {
    const updated = services.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    )
    onChange({ services: updated })
  }

  function addService() {
    onChange({ services: [...services, { ...DEFAULT_SERVICE }] })
  }

  function removeService(index: number) {
    onChange({ services: services.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      {services.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum serviço cadastrado. O bot assumirá consulta genérica de 60
          minutos.
        </p>
      )}

      {services.map((service, index) => (
        <div
          key={index}
          className="rounded-lg border p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Serviço {index + 1}
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`service-active-${index}`} className="text-xs">
                  Ativo
                </Label>
                <Switch
                  id={`service-active-${index}`}
                  checked={service.active}
                  onCheckedChange={(checked) =>
                    updateService(index, { active: !!checked })
                  }
                  size="sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeService(index)}
              >
                <TrashIcon className="size-4 text-destructive" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`service-name-${index}`}>Nome</Label>
              <Input
                id={`service-name-${index}`}
                placeholder="Consulta Cardiológica"
                value={service.name}
                onChange={(e) =>
                  updateService(index, { name: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`service-duration-${index}`}>
                Duração (minutos)
              </Label>
              <Input
                id={`service-duration-${index}`}
                type="number"
                min={5}
                step={5}
                value={service.duration_minutes}
                onChange={(e) =>
                  updateService(index, {
                    duration_minutes: parseInt(e.target.value) || 60,
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select
                value={service.modality}
                onValueChange={(value) =>
                  updateService(index, {
                    modality: value as ServiceModality,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODALITIES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`service-price-${index}`}>Preço (R$)</Label>
              <Input
                id={`service-price-${index}`}
                type="number"
                min={0}
                step={0.01}
                placeholder="350.00"
                value={service.price ?? ''}
                onChange={(e) =>
                  updateService(index, {
                    price: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addService}>
        <PlusIcon className="mr-2 size-4" />
        Adicionar serviço
      </Button>
    </div>
  )
}
