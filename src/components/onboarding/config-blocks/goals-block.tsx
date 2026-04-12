'use client'

import { type ReactNode } from 'react'
import { CalendarDays, MessageSquare, Headphones, RotateCcw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingDraft } from '@/types/onboarding'

interface Props {
  draft: OnboardingDraft
  onChange: (updates: Partial<OnboardingDraft>) => void
}

type GoalKey = keyof OnboardingDraft['goals']

const GOALS: { key: GoalKey; label: string; description: string; icon: ReactNode }[] = [
  {
    key: 'qualifies',
    label: 'Qualificar leads',
    description: 'Entender a necessidade antes de avançar',
    icon: <MessageSquare className="size-5" />,
  },
  {
    key: 'schedules',
    label: 'Agendar consultas',
    description: 'Marcar horários automaticamente pelo WhatsApp',
    icon: <CalendarDays className="size-5" />,
  },
  {
    key: 'supports',
    label: 'Suporte / pós-atendimento',
    description: 'Responder dúvidas e acompanhar após o atendimento',
    icon: <Headphones className="size-5" />,
  },
  {
    key: 'followup',
    label: 'Follow-up automático',
    description: 'Reengajar leads e lembrar de consultas agendadas',
    icon: <RotateCcw className="size-5" />,
  },
  {
    key: 'usesHumanHandoff',
    label: 'Humano no loop',
    description: 'Transferir para atendente em situações específicas',
    icon: <Users className="size-5" />,
  },
]

export function GoalsBlock({ draft, onChange }: Props) {
  const { goals } = draft

  function toggleGoal(key: GoalKey) {
    onChange({ goals: { ...goals, [key]: !goals[key] } })
  }

  const anySelected = Object.values(goals).some(Boolean)

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Selecione tudo que o bot deve fazer. Isso determina quais configurações aparecerão no próximo passo.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {GOALS.map(({ key, label, description, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleGoal(key)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
              goals[key]
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40'
            )}
          >
            <div className={cn('mt-0.5 shrink-0', goals[key] ? 'text-primary' : 'text-muted-foreground')}>
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium leading-tight">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {!anySelected && (
        <p className="text-sm text-amber-600">
          Selecione ao menos um objetivo para continuar.
        </p>
      )}
    </div>
  )
}
