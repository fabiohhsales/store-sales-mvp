'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { toast } from 'sonner'
import { Settings } from 'lucide-react'
import { ProfessionalSection } from '@/components/bot-config/professional-section'
import { ServicesSection } from '@/components/bot-config/services-section'
import { StagesLabelsSection } from '@/components/bot-config/stages-labels-section'
import { WorkingHoursSection } from '@/components/bot-config/working-hours-section'
import { AiBehaviorSection } from '@/components/bot-config/ai-behavior-section'
import { FollowupSection } from '@/components/bot-config/followup-section'
import { MessageTemplatesSection } from '@/components/bot-config/message-templates-section'
import { HandoffSection } from '@/components/bot-config/handoff-section'
import { CalendarSection } from '@/components/bot-config/calendar-section'
import { AdvancedSection } from '@/components/bot-config/advanced-section'
import { DEFAULT_STAGE_LABELS } from '@/lib/bot/stage-labels'
import type { PanelBotConfig, WorkingHours } from '@/types/database'

interface BotConfigStepProps {
  clientId: string
  initialConfig?: Partial<PanelBotConfig>
  onComplete: (config: Partial<PanelBotConfig>) => void
}

const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  tuesday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  wednesday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  thursday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  friday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  saturday: { enabled: false, start: '08:00', end: '12:00', break_start: null, break_end: null },
  sunday: { enabled: false, start: '08:00', end: '12:00', break_start: null, break_end: null },
}

export function BotConfigStep({ clientId, initialConfig, onComplete }: BotConfigStepProps) {
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<Partial<PanelBotConfig>>({
    professional_name: '',
    ai_tone: 'professional_friendly',
    ai_language: 'pt-BR',
    services: [],
    stage_labels: DEFAULT_STAGE_LABELS,
    working_hours: DEFAULT_WORKING_HOURS,
    appointment_duration_default: 60,
    appointment_buffer_minutes: 15,
    max_advance_booking_days: 60,
    min_advance_booking_hours: 2,
    allow_same_day_booking: true,
    followup_enabled: true,
    followup_confirmation_hours_before: 24,
    followup_reminder_hours_before: 2,
    followup_noshow_enabled: true,
    handoff_on_negative_sentiment: true,
    handoff_on_medical_urgency: true,
    handoff_on_unknown_intent: false,
    handoff_max_ai_turns: 20,
    handoff_keywords: [],
    calendar_create_meet_link: false,
    calendar_send_invite_to_patient: false,
    chatwoot_auto_resolve_hours: 24,
    chatwoot_working_hours_enabled: true,
    ...initialConfig,
  })

  useEffect(() => {
    let cancelled = false

    async function loadLatestConfig() {
      try {
        const res = await fetch(`/api/bot-config?client_id=${clientId}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setConfig((prev) => ({ ...prev, ...data }))
      } catch {
        // Falha de pull não deve bloquear o onboarding
      }
    }

    void loadLatestConfig()
    return () => {
      cancelled = true
    }
  }, [clientId])

  const handleChange = (updates: Partial<PanelBotConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
  }

  const handleSave = async () => {
    if (!config.professional_name) {
      toast.error('Nome do profissional é obrigatório')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, client_id: clientId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar configuração')
      }

      toast.success('Configuração salva!')
      onComplete(config)
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
          Configure o comportamento do assistente virtual. Todos os campos têm valores padrão — ajuste conforme necessário.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion defaultValue={['professional']}>
          <AccordionItem value="professional">
            <AccordionTrigger>Perfil Profissional</AccordionTrigger>
            <AccordionContent>
              <ProfessionalSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="services">
            <AccordionTrigger>Serviços</AccordionTrigger>
            <AccordionContent>
              <ServicesSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="stages">
            <AccordionTrigger>Configuração de Etapas</AccordionTrigger>
            <AccordionContent>
              <StagesLabelsSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="hours">
            <AccordionTrigger>Horários de Atendimento</AccordionTrigger>
            <AccordionContent>
              <WorkingHoursSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ai">
            <AccordionTrigger>Comportamento da IA</AccordionTrigger>
            <AccordionContent>
              <AiBehaviorSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="followup">
            <AccordionTrigger>Follow-up</AccordionTrigger>
            <AccordionContent>
              <FollowupSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="templates">
            <AccordionTrigger>Templates de Mensagem</AccordionTrigger>
            <AccordionContent>
              <MessageTemplatesSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="handoff">
            <AccordionTrigger>Regras de Handoff</AccordionTrigger>
            <AccordionContent>
              <HandoffSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="calendar">
            <AccordionTrigger>Google Calendar</AccordionTrigger>
            <AccordionContent>
              <CalendarSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="advanced">
            <AccordionTrigger>Avançado</AccordionTrigger>
            <AccordionContent>
              <AdvancedSection config={config} onChange={handleChange} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar e Continuar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
