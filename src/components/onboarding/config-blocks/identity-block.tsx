'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiTone, BusinessSegment } from '@/types/database'
import type { OnboardingDraft, OnboardingService } from '@/types/onboarding'

interface Props {
  draft: OnboardingDraft
  onChange: (updates: Partial<OnboardingDraft>) => void
}

const SEGMENTS: { value: BusinessSegment; label: string }[] = [
  { value: 'medicina', label: 'Medicina' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'estetica', label: 'Estética' },
  { value: 'loja', label: 'Loja (Comércio)' },
  { value: 'outro', label: 'Outro' },
]

const TONES: { value: AiTone; label: string; preview: string }[] = [
  { value: 'formal', label: 'Formal', preview: 'Prezado(a), como posso auxiliá-lo(a)?' },
  { value: 'professional_friendly', label: 'Profissional e amigável', preview: 'Olá! Como posso ajudar?' },
  { value: 'casual', label: 'Casual', preview: 'Oi! Tudo bem? Como posso te ajudar?' },
  { value: 'empathetic', label: 'Empático', preview: 'Olá! Fico feliz em ajudar. Como você está?' },
]

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es', label: 'Español' },
]

const DEFAULT_SERVICE: OnboardingService = {
  name: '',
  duration_minutes: 60,
  modality: 'presencial',
}

export function IdentityBlock({ draft, onChange }: Props) {
  const { business, services } = draft

  function setBusiness(updates: Partial<OnboardingDraft['business']>) {
    onChange({ business: { ...business, ...updates } })
  }

  function addService() {
    onChange({ services: [...services, { ...DEFAULT_SERVICE }] })
  }

  function updateService(i: number, updates: Partial<OnboardingService>) {
    onChange({ services: services.map((s, idx) => (idx === i ? { ...s, ...updates } : s)) })
  }

  function removeService(i: number) {
    onChange({ services: services.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-7">
      {/* Business info */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Sobre o negócio</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ob-prof-name">Nome de quem assina o atendimento *</Label>
            <Input
              id="ob-prof-name"
              placeholder="Dr. João Silva"
              value={business.professionalName}
              onChange={(e) => setBusiness({ professionalName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-prof-title">Título / Especialidade</Label>
            <Input
              id="ob-prof-title"
              placeholder="Médico Cardiologista"
              value={business.professionalTitle}
              onChange={(e) => setBusiness({ professionalTitle: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-biz-name">Nome do negócio *</Label>
            <Input
              id="ob-biz-name"
              placeholder="Clínica São Lucas"
              value={business.businessName}
              onChange={(e) => setBusiness({ businessName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-phone">Telefone</Label>
            <Input
              id="ob-phone"
              placeholder="(11) 99999-9999"
              value={business.phone}
              onChange={(e) => setBusiness({ phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <Select
              value={business.segment}
              onValueChange={(v) => setBusiness({ segment: (v ?? '') as BusinessSegment | '' })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Idioma do atendimento</Label>
            <Select
              value={business.language}
              onValueChange={(v) => setBusiness({ language: v ?? 'pt-BR' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tone chips */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Tom do atendimento</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TONES.map((tone) => (
            <button
              key={tone.value}
              type="button"
              onClick={() => setBusiness({ tone: tone.value })}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border p-3 text-left text-sm transition-colors',
                business.tone === tone.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <span className="font-medium text-xs leading-tight">{tone.label}</span>
              <span className="text-xs text-muted-foreground line-clamp-2 leading-snug">{tone.preview}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Services */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Serviços principais</h3>
            <p className="text-xs text-muted-foreground">Opcional — o bot assumirá serviço genérico se não cadastrado</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addService}>
            <PlusIcon className="size-3.5 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="space-y-2">
          {services.map((svc, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder="Nome do serviço"
                value={svc.name}
                onChange={(e) => updateService(i, { name: e.target.value })}
                className="flex-1"
              />
              <Input
                type="number"
                min={5}
                step={5}
                value={svc.duration_minutes}
                onChange={(e) => updateService(i, { duration_minutes: parseInt(e.target.value) || 60 })}
                className="w-20 shrink-0"
                title="Duração (min)"
              />
              <span className="text-xs text-muted-foreground shrink-0">min</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeService(i)}
                className="shrink-0"
              >
                <TrashIcon className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
