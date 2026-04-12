'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getVisibleBlocks } from '@/lib/onboarding/conditional-flow'
import type { OnboardingDraft, HandoffReason } from '@/types/onboarding'
import type { DaySchedule, WorkingHours } from '@/types/database'

interface Props {
  draft: OnboardingDraft
  onChange: (updates: Partial<OnboardingDraft>) => void
}

const HANDOFF_REASONS: { key: HandoffReason; label: string }[] = [
  { key: 'negative_sentiment', label: 'Sentimento negativo detectado' },
  { key: 'medical_urgency', label: 'Urgência médica / emergência' },
  { key: 'unknown_intent', label: 'Bot não entendeu a intenção' },
  { key: 'user_request', label: 'Usuário pediu atendente' },
  { key: 'price_negotiation', label: 'Negociação de preço' },
  { key: 'complaint', label: 'Reclamação' },
]

const INTAKE_OPTIONS: { key: string; label: string }[] = [
  { key: 'full_name', label: 'Nome completo' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'date_of_birth', label: 'Data de nascimento' },
  { key: 'city', label: 'Cidade' },
  { key: 'referral_source', label: 'Como nos conheceu' },
  { key: 'chief_complaint', label: 'Motivo da consulta' },
  { key: 'medications', label: 'Medicações em uso' },
]

const DAYS: { key: keyof WorkingHours; label: string }[] = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

export function OperationsBlock({ draft, onChange }: Props) {
  const { flow, scheduling, followupModes, workingHours } = draft
  const blocks = getVisibleBlocks(draft)

  function setFlow(updates: Partial<OnboardingDraft['flow']>) {
    onChange({ flow: { ...flow, ...updates } })
  }

  function setScheduling(updates: Partial<OnboardingDraft['scheduling']>) {
    onChange({ scheduling: { ...scheduling, ...updates } })
  }

  function setFollowupModes(updates: Partial<OnboardingDraft['followupModes']>) {
    onChange({ followupModes: { ...followupModes, ...updates } })
  }

  function toggleHandoffReason(key: HandoffReason) {
    const next = flow.handoffReasons.includes(key)
      ? flow.handoffReasons.filter((r) => r !== key)
      : [...flow.handoffReasons, key]
    setFlow({ handoffReasons: next })
  }

  function toggleIntakeField(key: string) {
    const next = flow.intakeFields.includes(key)
      ? flow.intakeFields.filter((k) => k !== key)
      : [...flow.intakeFields, key]
    setFlow({ intakeFields: next })
  }

  function updateDay(dayKey: keyof WorkingHours, updates: Partial<DaySchedule>) {
    onChange({
      workingHours: {
        ...workingHours,
        [dayKey]: { ...workingHours[dayKey], ...updates },
      },
    })
  }

  return (
    <div className="space-y-8">

      {/* ── Working Hours — always visible ─────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Horários de atendimento</h3>
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = workingHours[key]
            return (
              <div key={key} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <Switch
                  checked={day.enabled}
                  onCheckedChange={(checked) => updateDay(key, { enabled: checked })}
                />
                <span className={cn('w-20 text-sm shrink-0', !day.enabled && 'text-muted-foreground')}>
                  {label}
                </span>
                {day.enabled && (
                  <>
                    <Input
                      type="time"
                      value={day.start}
                      onChange={(e) => updateDay(key, { start: e.target.value })}
                      className="w-28 h-7 text-sm"
                    />
                    <span className="text-muted-foreground text-xs">até</span>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={(e) => updateDay(key, { end: e.target.value })}
                      className="w-28 h-7 text-sm"
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Scheduling ─────────────────────────────────────────────────── */}
      {blocks.includes('scheduling') && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Configuração da agenda</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Duração padrão da consulta (min)</Label>
              <Input
                type="number"
                min={5}
                step={5}
                value={scheduling.defaultDuration}
                onChange={(e) => setScheduling({ defaultDuration: parseInt(e.target.value) || 60 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Buffer entre consultas (min)</Label>
              <Input
                type="number"
                min={0}
                step={5}
                value={scheduling.bufferMinutes}
                onChange={(e) => setScheduling({ bufferMinutes: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Antecedência máxima (dias)</Label>
              <Input
                type="number"
                min={1}
                value={scheduling.maxAdvanceDays}
                onChange={(e) => setScheduling({ maxAdvanceDays: parseInt(e.target.value) || 60 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Antecedência mínima (horas)</Label>
              <Input
                type="number"
                min={0}
                value={scheduling.minAdvanceHours}
                onChange={(e) => setScheduling({ minAdvanceHours: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="ob-same-day"
              checked={scheduling.sameDayBooking}
              onCheckedChange={(checked) => setScheduling({ sameDayBooking: checked })}
            />
            <Label htmlFor="ob-same-day">Permitir agendamento no mesmo dia</Label>
          </div>
        </section>
      )}

      {/* ── Intake ─────────────────────────────────────────────────────── */}
      {blocks.includes('intake') && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="ob-intake"
              checked={flow.requiresIntake}
              onCheckedChange={(checked) => setFlow({ requiresIntake: checked })}
            />
            <div>
              <Label htmlFor="ob-intake">Coletar informações antes de prosseguir</Label>
              <p className="text-xs text-muted-foreground">O bot pedirá esses dados durante a conversa</p>
            </div>
          </div>
          {flow.requiresIntake && (
            <div className="pl-12 space-y-3">
              <p className="text-xs text-muted-foreground">Quais informações coletar?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {INTAKE_OPTIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={flow.intakeFields.includes(key)}
                      onChange={() => toggleIntakeField(key)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Switch
                  id="ob-media"
                  checked={flow.asksForMedia}
                  onCheckedChange={(checked) => setFlow({ asksForMedia: checked })}
                />
                <Label htmlFor="ob-media">Pedir fotos ou documentos</Label>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Handoff reasons ────────────────────────────────────────────── */}
      {blocks.includes('handoff') && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Quando transferir para humano?</h3>
            <p className="text-xs text-muted-foreground">Marque todas as situações em que o bot deve acionar atendente</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {HANDOFF_REASONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={flow.handoffReasons.includes(key)}
                  onChange={() => toggleHandoffReason(key)}
                  className="rounded border-border"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── Follow-up modes ─────────────────────────────────────────────── */}
      {blocks.includes('followup_modes') && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Tipos de follow-up</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                id="ob-fu-appointment"
                checked={followupModes.appointment}
                onCheckedChange={(checked) => setFollowupModes({ appointment: checked })}
              />
              <div>
                <Label htmlFor="ob-fu-appointment">Confirmação de consulta</Label>
                <p className="text-xs text-muted-foreground">Lembrete 24h antes e confirmação de presença</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                id="ob-fu-lead"
                checked={followupModes.lead}
                onCheckedChange={(checked) => setFollowupModes({ lead: checked })}
              />
              <div>
                <Label htmlFor="ob-fu-lead">Reengajamento de leads</Label>
                <p className="text-xs text-muted-foreground">Sequência automática para leads que não agendaram</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                id="ob-fu-attendance"
                checked={followupModes.attendance}
                onCheckedChange={(checked) => setFollowupModes({ attendance: checked })}
              />
              <div>
                <Label htmlFor="ob-fu-attendance">Follow-up pós-atendimento</Label>
                <p className="text-xs text-muted-foreground">Acompanhamento após consulta / atendimento</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
