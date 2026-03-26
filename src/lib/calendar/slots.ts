// Cálculo de horários disponíveis a partir do Google Calendar + working_hours do cliente.
// São Paulo é UTC-3 sem horário de verão (desde 2019).

import { createAiClient, AI_MODEL_MINI } from '@/lib/ai/client'
import type { CalendarClient } from './client'
import type { WorkingHours } from '@/types/database'

const SP_OFFSET = '-03:00'
const TIMEZONE = 'America/Sao_Paulo'

const WEEKDAY_KEYS: Record<string, keyof WorkingHours> = {
  sunday: 'sunday',
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
}

const DAYS_PT: Record<string, string> = {
  sunday: 'Dom', monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua',
  thursday: 'Qui', friday: 'Sex', saturday: 'Sáb',
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface TimeSlot {
  startUTC: Date
  endUTC: Date
  label: string // "Seg, 10/jan às 09:00"
}

// --- Helpers de timezone ---

// Data/hora em São Paulo a partir de uma Date UTC
function spParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'long',
  })
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    year: parseInt(p.year),
    month: parseInt(p.month), // 1-12
    day: parseInt(p.day),
    hour: parseInt(p.hour === '24' ? '0' : p.hour),
    minute: parseInt(p.minute),
    weekday: p.weekday.toLowerCase() as keyof WorkingHours,
  }
}

// Converte data SP "YYYY-MM-DD" + hora "HH:MM" em Date UTC
function spToUTC(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00${SP_OFFSET}`)
}

// Obtém string de data SP "YYYY-MM-DD" de uma Date UTC
function spDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
}

// Label legível em português: "Seg, 10/jan às 09:00"
function slotLabel(start: Date): string {
  const p = spParts(start)
  const dayName = DAYS_PT[p.weekday] ?? p.weekday
  const month = MONTHS_PT[p.month - 1]
  return `${dayName}, ${p.day}/${month} às ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

// --- Interpretação do time_window_hint via AI ---

const openai = createAiClient()

export async function parseTimeWindow(
  hint: string | null,
  referenceDate: Date = new Date()
): Promise<{ start: Date; end: Date }> {
  const todaySP = spDateStr(referenceDate)
  const defaultEnd = new Date(referenceDate.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (!hint) return { start: referenceDate, end: defaultEnd }

  try {
    const res = await openai.chat.completions.create({
      model: AI_MODEL_MINI,
      messages: [
        {
          role: 'user',
          content: `Hoje é ${todaySP} (São Paulo, Brasil).
Interprete a expressão de tempo: "${hint}"
Responda APENAS JSON com start_date e end_date em formato YYYY-MM-DD.
{"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 60,
      temperature: 0,
    })

    const raw = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    if (raw.start_date && raw.end_date) {
      return {
        start: new Date(`${raw.start_date}T00:00:00${SP_OFFSET}`),
        end: new Date(`${raw.end_date}T23:59:00${SP_OFFSET}`),
      }
    }
  } catch {
    // fallback para próximos 7 dias
  }

  return { start: referenceDate, end: defaultEnd }
}

// --- Cálculo de slots disponíveis ---

interface BusyInterval {
  start: string
  end: string
}

export async function getAvailableSlots(
  calendar: CalendarClient,
  calendarId: string,
  dateRange: { start: Date; end: Date },
  workingHours: WorkingHours,
  durationMinutes: number,
  bufferMinutes: number,
  maxSlots = 6
): Promise<TimeSlot[]> {
  // 1. Busca horários ocupados via freebusy
  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: dateRange.start.toISOString(),
      timeMax: dateRange.end.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: calendarId }],
    },
  })

  const busyTimes: BusyInterval[] =
    (freebusyRes.data.calendars?.[calendarId]?.busy as BusyInterval[]) ?? []

  // 2. Gera candidatos de slot por dia
  const available: TimeSlot[] = []
  const stepMs = (durationMinutes + bufferMinutes) * 60 * 1000
  const durationMs = durationMinutes * 60 * 1000

  let cursor = new Date(dateRange.start)
  // Começa no próximo dia inteiro se já é fim do expediente
  cursor.setUTCMinutes(0, 0, 0)

  while (cursor < dateRange.end && available.length < maxSlots) {
    const dateStr = spDateStr(cursor)
    const weekday = spParts(cursor).weekday
    const day = workingHours[WEEKDAY_KEYS[weekday] ?? weekday]

    if (!day?.enabled) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      continue
    }

    const workStart = spToUTC(dateStr, day.start)
    const workEnd = spToUTC(dateStr, day.end)
    const breakStart = day.break_start ? spToUTC(dateStr, day.break_start) : null
    const breakEnd = day.break_end ? spToUTC(dateStr, day.break_end) : null

    let slotStart = workStart
    // Não oferece slots no passado
    if (slotStart < new Date()) slotStart = roundUpToStep(new Date(), stepMs)

    while (slotStart.getTime() + durationMs <= workEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + durationMs)

      const inBreak = breakStart && breakEnd && slotStart < breakEnd && slotEnd > breakStart
      const isBusy = busyTimes.some((b) => {
        const bs = new Date(b.start)
        const be = new Date(b.end)
        return slotStart < be && slotEnd > bs
      })

      if (!inBreak && !isBusy) {
        available.push({
          startUTC: new Date(slotStart),
          endUTC: new Date(slotEnd),
          label: slotLabel(slotStart),
        })
        if (available.length >= maxSlots) break
      }

      slotStart = new Date(slotStart.getTime() + stepMs)
    }

    // Próximo dia
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    cursor.setUTCHours(0, 0, 0, 0)
  }

  return available
}

function roundUpToStep(date: Date, stepMs: number): Date {
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs)
}

// Formata lista de slots para mensagem WhatsApp
export function formatSlotsMessage(slots: TimeSlot[], professionalName: string): string {
  if (slots.length === 0) {
    return `Não encontrei horários disponíveis nesse período. Quer que eu verifique outra semana?`
  }

  const list = slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')
  return `Encontrei estes horários disponíveis com ${professionalName}:\n\n${list}\n\nQual desses funciona para você?`
}
