'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { DaySchedule, PanelBotConfig, WorkingHours } from '@/types/database'

interface SectionProps {
  config: Partial<PanelBotConfig>
  onChange: (updates: Partial<PanelBotConfig>) => void
}

type DayKey = keyof WorkingHours

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

const DEFAULT_DAY: DaySchedule = {
  enabled: false,
  start: '08:00',
  end: '18:00',
  break_start: '12:00',
  break_end: '13:00',
}

const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  tuesday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  wednesday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  thursday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  friday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  saturday: { ...DEFAULT_DAY },
  sunday: { ...DEFAULT_DAY },
}

export function WorkingHoursSection({ config, onChange }: SectionProps) {
  const hours = config.working_hours ?? DEFAULT_WORKING_HOURS

  function updateDay(day: DayKey, updates: Partial<DaySchedule>) {
    onChange({
      working_hours: {
        ...hours,
        [day]: { ...hours[day], ...updates },
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Grid de dias */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Configure os horários de atendimento para cada dia da semana.
        </p>

        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = hours[key] ?? DEFAULT_DAY
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="flex w-28 items-center gap-2">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={(checked) =>
                      updateDay(key, { enabled: !!checked })
                    }
                    size="sm"
                  />
                  <span className="text-sm font-medium">{label}</span>
                </div>

                {day.enabled && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Input
                      type="time"
                      value={day.start}
                      onChange={(e) => updateDay(key, { start: e.target.value })}
                      className="w-28"
                    />
                    <span className="text-muted-foreground">às</span>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={(e) => updateDay(key, { end: e.target.value })}
                      className="w-28"
                    />
                    <span className="text-muted-foreground ml-2">Intervalo:</span>
                    <Input
                      type="time"
                      value={day.break_start ?? ''}
                      onChange={(e) =>
                        updateDay(key, {
                          break_start: e.target.value || null,
                        })
                      }
                      className="w-28"
                    />
                    <span className="text-muted-foreground">às</span>
                    <Input
                      type="time"
                      value={day.break_end ?? ''}
                      onChange={(e) =>
                        updateDay(key, {
                          break_end: e.target.value || null,
                        })
                      }
                      className="w-28"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Configurações de agendamento */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Regras de agendamento</h4>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="appointment_duration_default">
              Duração padrão (minutos)
            </Label>
            <Input
              id="appointment_duration_default"
              type="number"
              min={5}
              step={5}
              value={config.appointment_duration_default ?? 60}
              onChange={(e) =>
                onChange({
                  appointment_duration_default: parseInt(e.target.value) || 60,
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="appointment_buffer_minutes">
              Intervalo entre consultas (minutos)
            </Label>
            <Input
              id="appointment_buffer_minutes"
              type="number"
              min={0}
              step={5}
              value={config.appointment_buffer_minutes ?? 15}
              onChange={(e) =>
                onChange({
                  appointment_buffer_minutes: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max_advance_booking_days">
              Máximo de dias de antecedência
            </Label>
            <Input
              id="max_advance_booking_days"
              type="number"
              min={1}
              value={config.max_advance_booking_days ?? 60}
              onChange={(e) =>
                onChange({
                  max_advance_booking_days: parseInt(e.target.value) || 60,
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="min_advance_booking_hours">
              Mínimo de horas de antecedência
            </Label>
            <Input
              id="min_advance_booking_hours"
              type="number"
              min={0}
              value={config.min_advance_booking_hours ?? 2}
              onChange={(e) =>
                onChange({
                  min_advance_booking_hours: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="allow_same_day_booking"
            checked={config.allow_same_day_booking ?? true}
            onCheckedChange={(checked) =>
              onChange({ allow_same_day_booking: !!checked })
            }
          />
          <Label htmlFor="allow_same_day_booking">
            Permitir agendamento para o mesmo dia
          </Label>
        </div>
      </div>
    </div>
  )
}
