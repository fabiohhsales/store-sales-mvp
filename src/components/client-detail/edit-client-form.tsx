'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { ProfessionalSection } from '@/components/bot-config/professional-section'
import { ServicesSection } from '@/components/bot-config/services-section'
import { StagesLabelsSection } from '@/components/bot-config/stages-labels-section'
import { WorkingHoursSection } from '@/components/bot-config/working-hours-section'
import { AiBehaviorSection } from '@/components/bot-config/ai-behavior-section'
import { FollowupSection } from '@/components/bot-config/followup-section'
import { MessageTemplatesSection } from '@/components/bot-config/message-templates-section'
import { HandoffSection } from '@/components/bot-config/handoff-section'
import { IntakeSection } from '@/components/bot-config/intake-section'
import { CalendarSection } from '@/components/bot-config/calendar-section'
import { AdvancedSection } from '@/components/bot-config/advanced-section'
import { DEFAULT_STAGE_LABELS } from '@/lib/bot/stage-labels'
import type { PanelClientWithRelations, PanelBotConfig, WorkingHours, ProvisionedChatwootAgent } from '@/types/database'
import type { ChatwootAgentRole } from '@/types/api'

interface EditClientFormProps {
  client: PanelClientWithRelations
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

const DEFAULT_BOT_CONFIG: Partial<PanelBotConfig> = {
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
  intake_enabled: false,
  intake_fields: [],
  intake_request_photos: false,
  intake_photos_count: 5,
  intake_handoff_after_photos: true,
  calendar_create_meet_link: false,
  calendar_send_invite_to_patient: false,
  chatwoot_auto_resolve_hours: 24,
  chatwoot_working_hours_enabled: true,
}

const DEFAULT_AGENT: ProvisionedChatwootAgent = { name: '', email: '', role: 'agent' }

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function EditClientForm({ client }: EditClientFormProps) {
  const [loading, setLoading] = useState(false)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [chatwootUsers, setChatwootUsers] = useState<ProvisionedChatwootAgent[]>(
    client.provisioned_agents ?? []
  )
  const [clientData, setClientData] = useState({
    name: client.name,
    owner_name: client.owner_name,
    email: client.email,
    phone: client.phone || '',
  })
  const [botConfig, setBotConfig] = useState<Partial<PanelBotConfig>>(
    client.panel_bot_config || DEFAULT_BOT_CONFIG
  )

  const handleSaveClient = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Dados do cliente salvos')
    } catch {
      toast.error('Erro ao salvar dados do cliente')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveBotConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...botConfig, client_id: client.id }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Configuração do bot salva')
    } catch {
      toast.error('Erro ao salvar configuração do bot')
    } finally {
      setLoading(false)
    }
  }

  const handleBotChange = (updates: Partial<PanelBotConfig>) => {
    setBotConfig((prev) => ({ ...prev, ...updates }))
  }

  const addAgent = () => setChatwootUsers((prev) => [...prev, { ...DEFAULT_AGENT }])
  const removeAgent = (i: number) => setChatwootUsers((prev) => prev.filter((_, idx) => idx !== i))
  const updateAgent = (i: number, updates: Partial<ProvisionedChatwootAgent>) =>
    setChatwootUsers((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...updates } : a)))

  const handleSaveAgents = async () => {
    const normalized = chatwootUsers.map((a) => ({
      ...a,
      name: a.name.trim(),
      email: a.email.trim().toLowerCase(),
    }))
    const invalid = normalized.find((a) => !a.name || !a.email || !isValidEmail(a.email))
    if (invalid) {
      toast.error('Preencha nome e e-mail válidos para todos os agentes')
      return
    }
    const emails = normalized.map((a) => a.email)
    if (new Set(emails).size !== emails.length) {
      toast.error('E-mails duplicados na lista de agentes')
      return
    }
    setAgentsLoading(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: normalized }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar agentes')
      const { agents_summary: s, chatwoot_provisioned } = data
      if (chatwoot_provisioned) {
        toast.success(
          `Agentes salvos — criados: ${s.created.length}, já existentes: ${s.existing.length}${
            s.failed.length ? `, falhas: ${s.failed.length}` : ''
          }`
        )
      } else {
        toast.success('Agentes salvos no banco. Serão provisionados no Chatwoot quando a instância for criada.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar agentes')
    } finally {
      setAgentsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadLatestConfig() {
      try {
        const res = await fetch(`/api/bot-config?client_id=${client.id}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setBotConfig((prev) => ({ ...prev, ...data }))
      } catch {
        // Falha de pull não deve bloquear edição
      }
    }

    void loadLatestConfig()
    return () => {
      cancelled = true
    }
  }, [client.id])

  return (
    <div className="space-y-6">
      {/* Agentes Chatwoot */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Agentes Chatwoot</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addAgent}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Adicionar agente
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {chatwootUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum agente adicional configurado.
            </p>
          ) : (
            <div className="space-y-3">
              {chatwootUsers.map((user, index) => (
                <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-12">
                  <div className="space-y-1 sm:col-span-4">
                    <Label htmlFor={`agent-name-${index}`}>Nome</Label>
                    <Input
                      id={`agent-name-${index}`}
                      placeholder="Maria Souza"
                      value={user.name}
                      onChange={(e) => updateAgent(index, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-4">
                    <Label htmlFor={`agent-email-${index}`}>E-mail</Label>
                    <Input
                      id={`agent-email-${index}`}
                      type="email"
                      placeholder="maria@clinica.com"
                      value={user.email}
                      onChange={(e) => updateAgent(index, { email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor={`agent-role-${index}`}>Papel</Label>
                    <Select
                      value={user.role}
                      onValueChange={(v) => updateAgent(index, { role: v as ChatwootAgentRole })}
                    >
                      <SelectTrigger id={`agent-role-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">Agente</SelectItem>
                        <SelectItem value="administrator">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAgent(index)}
                      aria-label={`Remover agente ${index + 1}`}
                    >
                      <TrashIcon className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSaveAgents} disabled={agentsLoading}>
              {agentsLoading ? 'Salvando...' : 'Salvar Agentes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do negócio</Label>
              <Input
                id="name"
                value={clientData.name}
                onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">Responsável</Label>
              <Input
                id="owner"
                value={clientData.owner_name}
                onChange={(e) => setClientData({ ...clientData, owner_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={clientData.email}
                onChange={(e) => setClientData({ ...clientData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={clientData.phone}
                onChange={(e) => setClientData({ ...clientData, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveClient} disabled={loading}>
              Salvar Dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração do Bot</CardTitle>
        </CardHeader>
          <CardContent>
            <Accordion defaultValue={['professional']}>
              <AccordionItem value="professional">
                <AccordionTrigger>Perfil Profissional</AccordionTrigger>
                <AccordionContent>
                  <ProfessionalSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="services">
                <AccordionTrigger>Serviços</AccordionTrigger>
                <AccordionContent>
                  <ServicesSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="stages">
                <AccordionTrigger>Configuração de Etapas</AccordionTrigger>
                <AccordionContent>
                  <StagesLabelsSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="hours">
                <AccordionTrigger>Horários</AccordionTrigger>
                <AccordionContent>
                  <WorkingHoursSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="ai">
                <AccordionTrigger>Comportamento da IA</AccordionTrigger>
                <AccordionContent>
                  <AiBehaviorSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="followup">
                <AccordionTrigger>Follow-up</AccordionTrigger>
                <AccordionContent>
                  <FollowupSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="templates">
                <AccordionTrigger>Templates de Mensagem</AccordionTrigger>
                <AccordionContent>
                  <MessageTemplatesSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="handoff">
                <AccordionTrigger>Regras de Handoff</AccordionTrigger>
                <AccordionContent>
                  <HandoffSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="intake">
                <AccordionTrigger>Intake de Pacientes</AccordionTrigger>
                <AccordionContent>
                  <IntakeSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="calendar">
                <AccordionTrigger>Google Calendar</AccordionTrigger>
                <AccordionContent>
                  <CalendarSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="advanced">
                <AccordionTrigger>Avançado</AccordionTrigger>
                <AccordionContent>
                  <AdvancedSection config={botConfig} onChange={handleBotChange} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSaveBotConfig} disabled={loading}>
                Salvar Configuração
              </Button>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}
