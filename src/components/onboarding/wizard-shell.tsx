'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { StepIndicator } from './step-indicator'
import { BusinessDataStep } from './steps/business-data'
import { WhatsAppConnectStep } from './steps/whatsapp-connect'
import { GoogleConnectStep } from './steps/google-connect'
import { BotConfigStep } from './steps/bot-config'
import { ReviewActivateStep } from './steps/review-activate'
import type { PanelBotConfig } from '@/types/database'

const STEPS = [
  { label: 'Dados', description: 'Dados do negócio' },
  { label: 'WhatsApp', description: 'Conectar WhatsApp' },
  { label: 'Agenda', description: 'Config. de Agenda' },
  { label: 'Configuração', description: 'Configurar bot' },
  { label: 'Revisão', description: 'Revisar e ativar' },
]

export function WizardShell() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialClientId = searchParams.get('client_id') || ''
  const initialStep = parseInt(searchParams.get('step') || '1', 10)

  const [currentStep, setCurrentStep] = useState(initialStep)
  const [clientId, setClientId] = useState(initialClientId)
  const [, setInstanceName] = useState('')
  const [botConfig, setBotConfig] = useState<Partial<PanelBotConfig>>({})

  const goToStep = useCallback(
    (step: number) => {
      setCurrentStep(step)
      const params = new URLSearchParams()
      if (clientId) params.set('client_id', clientId)
      params.set('step', String(step))
      router.replace(`/clients/new?${params.toString()}`, { scroll: false })
    },
    [clientId, router]
  )

  const handleClientCreated = useCallback(
    (id: string) => {
      setClientId(id)
      goToStep(2)
    },
    [goToStep]
  )

  const handleWhatsAppConnected = useCallback(
    (name: string) => {
      setInstanceName(name)
      goToStep(3)
    },
    [goToStep]
  )

  const handleCalendarSetup = useCallback(() => {
    goToStep(4)
  }, [goToStep])

  const handleBotConfigSaved = useCallback(
    (config: Partial<PanelBotConfig>) => {
      setBotConfig(config)
      goToStep(5)
    },
    [goToStep]
  )

  const handleActivated = useCallback(() => {
    router.push(`/clients/${clientId}`)
  }, [clientId, router])

  return (
    <div className="mx-auto max-w-3xl">
      <StepIndicator currentStep={currentStep} steps={STEPS} onStepClick={goToStep} />

      {currentStep === 1 && (
        <BusinessDataStep onComplete={handleClientCreated} />
      )}
      {currentStep === 2 && (
        <WhatsAppConnectStep
          clientId={clientId}
          onComplete={handleWhatsAppConnected}
          onSkip={() => goToStep(3)}
        />
      )}
      {currentStep === 3 && (
        <GoogleConnectStep
          clientId={clientId}
          onComplete={handleCalendarSetup}
          onSkip={() => goToStep(4)}
        />
      )}
      {currentStep === 4 && (
        <BotConfigStep
          clientId={clientId}
          initialConfig={botConfig}
          onComplete={handleBotConfigSaved}
        />
      )}
      {currentStep === 5 && (
        <ReviewActivateStep
          clientId={clientId}
          onActivated={handleActivated}
          onBack={() => goToStep(4)}
        />
      )}
    </div>
  )
}
