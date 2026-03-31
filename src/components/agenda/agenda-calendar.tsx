'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'
import type { AgendaAppointment } from '@/types/pipeline'

interface AgendaCalendarProps {
  clientId: string
  token?: string
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
  confirmed: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
  attended: 'bg-green-500/20 border-green-500/50 text-green-300',
  no_show: 'bg-red-500/20 border-red-500/50 text-red-300',
  cancelled: 'bg-zinc-500/20 border-zinc-500/50 text-zinc-400 line-through',
  rescheduled: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  attended: 'Compareceu',
  no_show: 'Faltou',
  cancelled: 'Cancelado',
  rescheduled: 'Reagendado',
}

const HOUR_START = 7
const HOUR_END = 21
const HOUR_HEIGHT = 60 // px per hour

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function getWeekDays(date: Date): Date[] {
  const start = new Date(date)
  const day = start.getDay()
  start.setDate(start.getDate() - day) // start of week (Sunday)
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatWeekRange(days: Date[]): string {
  const first = days[0]
  const last = days[6]
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} de ${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`
  }
  return `${first.getDate()} ${MONTH_NAMES[first.getMonth()]} – ${last.getDate()} ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`
}

export function AgendaCalendar({ clientId, token }: AgendaCalendarProps) {
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedApt, setSelectedApt] = useState<AgendaAppointment | null>(null)

  const today = new Date()
  const baseDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [weekOffset])

  const weekDays = useMemo(() => getWeekDays(baseDate), [baseDate])

  const fetchData = useCallback(async () => {
    try {
      const from = weekDays[0].toISOString().split('T')[0]
      const to = weekDays[6].toISOString().split('T')[0]
      const params = new URLSearchParams({
        ...(token ? { token } : { client_id: clientId }),
        date_from: from,
        date_to: to,
      })

      const res = await fetch(`/api/agenda?${params}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao carregar agenda')
      }

      const data = await res.json()
      setAppointments(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [clientId, token, weekDays])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // Posiciona um appointment no grid
  function getPosition(apt: AgendaAppointment) {
    const start = new Date(apt.start_at)
    const end = new Date(apt.end_at)
    const startHour = start.getHours() + start.getMinutes() / 60
    const endHour = end.getHours() + end.getMinutes() / 60
    const top = (startHour - HOUR_START) * HOUR_HEIGHT
    const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 24) // min 24px
    return { top, height }
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  // Current time indicator
  const nowHour = today.getHours() + today.getMinutes() / 60
  const nowTop = (nowHour - HOUR_START) * HOUR_HEIGHT

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <button onClick={() => { setLoading(true); fetchData() }} className="text-sm text-primary hover:underline">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-sm font-medium text-foreground">
          {formatWeekRange(weekDays)}
        </h2>
        <span className="text-xs text-muted-foreground">
          {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden bg-card">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
          <div className="p-2 text-xs text-muted-foreground border-r" />
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today)
            return (
              <div
                key={i}
                className={`p-2 text-center border-r last:border-r-0 ${isToday ? 'bg-primary/10' : ''}`}
              >
                <div className="text-xs text-muted-foreground">{DAY_NAMES[day.getDay()]}</div>
                <div className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {day.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] overflow-y-auto max-h-[calc(100vh-20rem)]">
          {/* Hour labels + grid rows */}
          <div className="relative">
            {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => (
              <div
                key={i}
                className="border-b border-r flex items-start justify-end pr-2 pt-0.5"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="text-[10px] text-muted-foreground">
                  {String(HOUR_START + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const dayApts = appointments.filter(apt => {
              const aptDate = new Date(apt.start_at)
              return isSameDay(aptDate, day)
            })
            const isToday = isSameDay(day, today)

            return (
              <div key={dayIdx} className={`relative border-r last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}>
                {/* Hour grid lines */}
                {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => (
                  <div key={i} className="border-b" style={{ height: HOUR_HEIGHT }} />
                ))}

                {/* Current time indicator */}
                {isToday && nowHour >= HOUR_START && nowHour <= HOUR_END && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowTop }}
                  >
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                      <div className="flex-1 h-[2px] bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Appointment blocks */}
                {dayApts.map(apt => {
                  const { top, height } = getPosition(apt)
                  const statusColor = STATUS_COLORS[apt.status || 'scheduled'] || STATUS_COLORS.scheduled

                  return (
                    <button
                      key={apt.id}
                      onClick={() => setSelectedApt(selectedApt?.id === apt.id ? null : apt)}
                      className={`absolute left-0.5 right-0.5 z-10 rounded border px-1.5 py-0.5 text-left overflow-hidden cursor-pointer transition-all hover:brightness-125 hover:shadow-lg ${statusColor}`}
                      style={{ top, height: Math.max(height, 24) }}
                    >
                      <div className="text-[10px] font-medium truncate">
                        {formatTime(apt.start_at)} {apt.contact_name || 'Sem nome'}
                      </div>
                      {height > 30 && (
                        <div className="text-[9px] opacity-70 truncate">
                          {apt.title || STATUS_LABELS[apt.status || 'scheduled']}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedApt && (
        <div className="border rounded-lg p-4 bg-card animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {selectedApt.contact_name || 'Sem nome'}
              </h3>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(selectedApt.start_at)} – {formatTime(selectedApt.end_at)}
              </p>
              {selectedApt.contact_phone && (
                <p className="text-xs text-muted-foreground">{selectedApt.contact_phone}</p>
              )}
              {selectedApt.title && (
                <p className="text-xs text-muted-foreground">Serviço: {selectedApt.title}</p>
              )}
              {selectedApt.meet_link && (
                <a href={selectedApt.meet_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  Abrir Meet
                </a>
              )}
            </div>
            <Badge variant="secondary">{STATUS_LABELS[selectedApt.status || 'scheduled']}</Badge>
          </div>
        </div>
      )}
    </div>
  )
}
