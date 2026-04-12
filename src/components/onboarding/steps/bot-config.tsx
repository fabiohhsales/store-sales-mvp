'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IdentityBlock } from '@/components/onboarding/config-blocks/identity-block'
import { GoalsBlock } from '@/components/onboarding/config-blocks/goals-block'
import { OperationsBlock } from '@/components/onboarding/config-blocks/operations-block'
import { ReviewBlock } from '@/components/onboarding/config-blocks/review-block'
import { mapOnboardingDraftToPanelBotConfig } from '@/lib/onboarding/map-draft-to-bot-config'
import { validateSubStep } from '@/lib/onboarding/conditional-flow'
import {
  DEFAULT_ONBOARDING_DRAFT,
  type OnboardingDraft,
} from '@/types/onboarding'
import type { PanelBotConfig } from '@/types/database'

interface BotConfigStepProps {
  clientId: string
  initialConfig?: Partial<PanelBotConfig>
  onComplete: (config: Partial<PanelBotConfig>) => void
}

const SUB_STEPS = [
  { label: 'Identidade', description: 'Quem é e qual o tom do atendimento' },
  { label: 'Objetivos', description: 'O que o bot vai fazer' },
  { label: 'Operações', description: 'Regras, horários e configurações' },
  { label: 'Revisão', description: 'Confirmar e salvar' },
]

function buildInitialDraft(config?: Partial<PanelBotConfig>): OnboardingDraft {
  if (!config?.professional_name) return { ...DEFAULT_ONBOARDING_DRAFT }
  return {
    ...DEFAULT_ONBOARDING_DRAFT,
    business: {
      ...DEFAULT_ONBOARDING_DRAFT.business,
      professionalName: config.professional_name ?? '',
      professionalTitle: config.professional_title ?? '',
      businessName: config.business_name ?? '',
      phone: config.business_phone ?? '',
      segment: config.business_segment ?? '',
      language: config.ai_language ?? 'pt-BR',
      tone: config.ai_tone ?? 'professional_friendly',
    },
    goals: {
      ...DEFAULT_ONBOARDING_DRAFT.goals,
      schedules: !!(config.appointment_duration_default),
      followup: !!(config.followup_enabled || config.lead_followup_enabled),
      usesHumanHandoff: !!(config.handoff_on_negative_sentiment || config.handoff_on_medical_urgency),
    },
    followupModes: {
      appointment: config.followup_enabled ?? true,
      lead: config.lead_followup_enabled ?? false,
      attendance: config.atendimento_followup_enabled ?? false,
    },
    workingHours: config.working_hours ?? DEFAULT_ONBOARDING_DRAFT.workingHours,
  }
}

export function BotConfigStep({ clientId, initialConfig, onComplete }: BotConfigStepProps) {
  const [loading, setLoading] = useState(false)
  const [subStep, setSubStep] = useState(1)
  const [draft, setDraft] = useState<OnboardingDraft>(() => buildInitialDraft(initialConfig))

  const handleChange = (updates: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }))
  }

  const validationError = validateSubStep(draft, subStep)
  const canProceed = !validationError

  const handleNext = () => {
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSubStep((s) => s + 1)
  }

  const handleSave = async () => {
    if (!draft.business.professionalName.trim()) {
      toast.error('Nome do responsável é obrigatório')
      return
    }

    setLoading(true)
    try {
      const payload = mapOnboardingDraftToPanelBotConfig(clientId, draft)
      const res = await fetch('/api/bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar configuração')
      }

      toast.success('Configuração salva!')
      onComplete(payload as Partial<PanelBotConfig>)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuração do Bot
        </CardTitle>
        <CardDescription>
          {SUB_STEPS[subStep - 1].description}
        </CardDescription>
      </CardHeader>

      {/* Sub-step indicator */}
      <div className="px-6 pb-2">
        <div className="flex items-center">
          {SUB_STEPS.map((s, i) => {
            const n = i + 1
            const active = subStep === n
            const done = subStep > n
            return (
              <div key={n} className="flex items-center flex-1 min-w-0">
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                    done
                      ? 'bg-primary text-primary-foreground'
                      : active
                      ? 'border-2 border-primary text-primary'
                      : 'border border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {n}
                </div>
                <span
                  className={cn(
                    'mx-1.5 text-xs truncate',
                    active ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
                {i < SUB_STEPS.length - 1 && (
                  <div className="flex-1 h-px bg-border mr-1.5" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <CardContent className="pt-4">
        {subStep === 1 && <IdentityBlock draft={draft} onChange={handleChange} />}
        {subStep === 2 && <GoalsBlock draft={draft} onChange={handleChange} />}
        {subStep === 3 && <OperationsBlock draft={draft} onChange={handleChange} />}
        {subStep === 4 && <ReviewBlock draft={draft} />}

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSubStep((s) => s - 1)}
            disabled={subStep === 1}
          >
            <ChevronLeft className="size-4 mr-1" /> Anterior
          </Button>

          {subStep < 4 ? (
            <Button
              type="button"
              size="sm"
              onClick={handleNext}
              disabled={!canProceed}
            >
              Próximo <ChevronRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar e continuar'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}


