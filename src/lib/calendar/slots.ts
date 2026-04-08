// Cálculo de horários disponíveis a partir do Google Calendar + working_hours do cliente.
// Suporta qualquer timezone IANA — não mais hardcoded para America/Sao_Paulo.

import { createAiClient, AI_MODEL_MINI } from '@/lib/ai/client'
import type { CalendarClient } from './client'
import type { WorkingHours } from '@/types/database'

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

const DAYS_EN: Record<string, string> = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface TimeSlot {
  startUTC: Date
  endUTC: Date
  label: string
  startISO: string
  endISO: string
}

// --- Helpers de timezone ---

/**
 * Retorna o offset UTC do timezone no instante `date`, no formato "+HH:MM" ou "-HH:MM".
 * Exemplo: "Europe/Athens" em horário de verão → "+03:00"
 */
function getTzOffset(timezone: string, date: Date): string {
  const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const tzMs = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getTime()
  const diffMin = Math.round((tzMs - utcMs) / 60000)
  const sign = diffMin >= 0 ? '+' : '-'
  const abs = Math.abs(diffMin)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/**
 * Decompõe um instante UTC em partes locais para o timezone dado.
 */
function tzParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'long',
  })
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    year: parseInt(p.year),
    month: parseInt(p.month),
    day: parseInt(p.day),
    hour: parseInt(p.hour === '24' ? '0' : p.hour),
    minute: parseInt(p.minute),
    weekday: p.weekday.toLowerCase() as keyof WorkingHours,
  }
}

/**
 * Converte uma hora local (dateStr + timeStr no timezone dado) para UTC.
 * Usa o truque de projeção: cria o instante como UTC ingênuo e corrige pelo offset real.
 */
function localToUTC(dateStr: string, timeStr: string, timezone: string): Date {
  const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`)
  const utcDisplay = new Date(naiveUTC.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDisplay = new Date(naiveUTC.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = utcDisplay.getTime() - tzDisplay.getTime()
  return new Date(naiveUTC.getTime() + offsetMs)
}

/**
 * Retorna a data local no formato YYYY-MM-DD para o timezone dado.
 */
function tzDateStr(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date)
}

/**
 * Converte um instante UTC para ISO local com offset, ex: "2026-04-07T09:00:00+03:00".
 */
function toTzISO(date: Date, timezone: string): string {
  const p = tzParts(date, timezone)
  const offset = getTzOffset(timezone, date)
  const mm = String(p.month).padStart(2, '0')
  const dd = String(p.day).padStart(2, '0')
  const hh = String(p.hour).padStart(2, '0')
  const min = String(p.minute).padStart(2, '0')
  return `${p.year}-${mm}-${dd}T${hh}:${min}:00${offset}`
}

function slotLabel(start: Date, end: Date, language: string, timezone: string): string {
  const p = tzParts(start, timezone)
  const isEn = !language.startsWith('pt')
  const dayName = isEn ? (DAYS_EN[p.weekday] ?? p.weekday) : (DAYS_PT[p.weekday] ?? p.weekday)
  const month = isEn ? MONTHS_EN[p.month - 1] : MONTHS_PT[p.month - 1]
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')

  const ep = tzParts(end, timezone)
  const ehh = String(ep.hour).padStart(2, '0')
  const emm = String(ep.minute).padStart(2, '0')

  const timeStr = isEn
    ? `${dayName}, ${month} ${p.day} · ${hh}:${mm}–${ehh}:${emm}`
    : `${dayName}, ${p.day}/${month} · ${hh}:${mm}–${ehh}:${emm}`

  const startISO = toTzISO(start, timezone)
  const endISO = toTzISO(end, timezone)

  // ISO inline para o AI extrair start_iso/end_iso quando paciente seleciona o número
  return `${timeStr} [${startISO}→${endISO}]`
}

// --- Interpretação do time_window_hint via AI ---

export async function parseTimeWindow(
  hint: string | null,
  referenceDate: Date = new Date(),
  timezone = 'America/Sao_Paulo'
): Promise<{ start: Date; end: Date }> {
  const todayLocal = tzDateStr(referenceDate, timezone)
  const defaultEnd = new Date(referenceDate.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (!hint) return { start: referenceDate, end: defaultEnd }

  try {
    const openai = createAiClient()
    const res = await openai.chat.completions.create({
      model: AI_MODEL_MINI,
      messages: [
        {
          role: 'user',
          content: `Today is ${todayLocal} (timezone: ${timezone}).
Interpret the time expression: "${hint}"
Reply ONLY with JSON: {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 60,
      temperature: 0,
    })

    const raw = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    if (raw.start_date && raw.end_date) {
      const offset = getTzOffset(timezone, referenceDate)
      return {
        start: new Date(`${raw.start_date}T00:00:00${offset}`),
        end: new Date(`${raw.end_date}T23:59:00${offset}`),
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
  maxSlots = 6,
  language = 'pt-BR',
  minAdvanceHours = 2,
  timezone = 'America/Sao_Paulo'
): Promise<TimeSlot[]> {
  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: dateRange.start.toISOString(),
      timeMax: dateRange.end.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarId }],
    },
  })

  const busyTimes: BusyInterval[] =
    (freebusyRes.data.calendars?.[calendarId]?.busy as BusyInterval[]) ?? []

  const available: TimeSlot[] = []
  const stepMs = (durationMinutes + bufferMinutes) * 60 * 1000
  const durationMs = durationMinutes * 60 * 1000

  let cursor = new Date(dateRange.start)
  cursor.setUTCMinutes(0, 0, 0)

  while (cursor < dateRange.end && available.length < maxSlots) {
    const dateStr = tzDateStr(cursor, timezone)
    const weekday = tzParts(cursor, timezone).weekday
    const day = workingHours[WEEKDAY_KEYS[weekday] ?? weekday]

    if (!day?.enabled) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      continue
    }

    const workStart = localToUTC(dateStr, day.start, timezone)
    const workEnd = localToUTC(dateStr, day.end, timezone)
    const breakStart = day.break_start ? localToUTC(dateStr, day.break_start, timezone) : null
    const breakEnd = day.break_end ? localToUTC(dateStr, day.break_end, timezone) : null

    let slotStart = workStart
    const earliestSlot = new Date(Date.now() + minAdvanceHours * 60 * 60 * 1000)
    if (slotStart < earliestSlot) slotStart = roundUpToStep(earliestSlot, stepMs)

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
          label: slotLabel(slotStart, slotEnd, language, timezone),
          startISO: toTzISO(slotStart, timezone),
          endISO: toTzISO(slotEnd, timezone),
        })
        if (available.length >= maxSlots) break
      }

      slotStart = new Date(slotStart.getTime() + stepMs)
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    cursor.setUTCHours(0, 0, 0, 0)
  }

  return available
}

function roundUpToStep(date: Date, stepMs: number): Date {
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs)
}

export function formatSlotsMessage(slots: TimeSlot[], professionalName: string, language = 'pt-BR'): string {
  const isEn = !language.startsWith('pt')

  if (slots.length === 0) {
    return isEn
      ? `No available slots found for that period. Would you like me to check another week?`
      : `Não encontrei horários disponíveis nesse período. Quer que eu verifique outra semana?`
  }

  const list = slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')

  return isEn
    ? `Here are the available slots with ${professionalName}:\n\n${list}\n\nWhich one works for you? Reply with the number.`
    : `Encontrei estes horários disponíveis com ${professionalName}:\n\n${list}\n\nQual desses funciona para você? Responda com o número.`
}
