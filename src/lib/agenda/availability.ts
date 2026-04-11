// Motor de disponibilidade baseado em appointments + working_hours.
// appointments é a fonte de verdade — Google Calendar NÃO é consultado aqui.

import { createAdminClient } from '@/lib/supabase/admin'
import type { PanelBotConfig, WorkingHours, DaySchedule } from '@/types/database'
import { getTzOffset, localToUTC, tzDateStr, toTzISO } from '@/lib/calendar/slots'

const WEEKDAY_KEYS: (keyof WorkingHours)[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

export interface AvailableSlot {
  start: string  // ISO with offset
  end: string    // ISO with offset
  label: string  // display label for WhatsApp/UI
}

export interface GetSlotsParams {
  clientId: string
  dateFrom: Date
  dateTo: Date
  maxSlots?: number
  language?: string
  /** Passa o botConfig já carregado (ex: calendar-agent já tem). Se omitido, busca do banco. */
  botConfig?: PanelBotConfig | null
}

export interface ValidateSlotParams {
  clientId: string
  startAt: string  // ISO
  endAt: string    // ISO
  ignoreAppointmentId?: string
  /** Passa o botConfig já carregado. Se omitido, busca do banco. */
  botConfig?: PanelBotConfig | null
}

export interface ValidationResult {
  valid: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Buscar blocos ocupados (appointments ativos no período)
// ---------------------------------------------------------------------------

interface BusyBlock { start: Date; end: Date }

async function fetchBusyBlocks(
  clientId: string,
  from: Date,
  to: Date,
  ignoreAppointmentId?: string,
): Promise<BusyBlock[]> {
  const admin = createAdminClient()

  // appointments se ligam a conversations que pertencem ao client
  let query = admin
    .from('appointments')
    .select('id, start_at, end_at, conversation_id, conversations!inner(client_id)')
    .neq('status', 'cancelled')
    .gte('start_at', from.toISOString())
    .lte('start_at', to.toISOString())
    .eq('conversations.client_id', clientId)

  if (ignoreAppointmentId) {
    query = query.neq('id', ignoreAppointmentId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Availability] Erro ao buscar appointments:', error.message)
    return []
  }

  return (data ?? []).map((row: { start_at: string; end_at: string }) => ({
    start: new Date(row.start_at),
    end: new Date(row.end_at),
  }))
}

// ---------------------------------------------------------------------------
// Carregar botConfig se não passado
// ---------------------------------------------------------------------------

async function resolveBotConfig(
  clientId: string,
  provided?: PanelBotConfig | null,
): Promise<PanelBotConfig | null> {
  if (provided !== undefined) return provided
  const admin = createAdminClient()
  const { data } = await admin
    .from('panel_bot_config')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  return (data as PanelBotConfig | null) ?? null
}

// ---------------------------------------------------------------------------
// getAvailableSlotsFromAppointments — motor principal
// ---------------------------------------------------------------------------

export async function getAvailableSlotsFromAppointments(
  params: GetSlotsParams,
): Promise<AvailableSlot[]> {
  const botConfig = await resolveBotConfig(params.clientId, params.botConfig)
  if (!botConfig?.working_hours || !botConfig.appointment_duration_default) return []

  const timezone = botConfig.timezone ?? 'America/Sao_Paulo'
  const durationMin = botConfig.appointment_duration_default
  const bufferMin = botConfig.appointment_buffer_minutes ?? 0
  const stepMs = (durationMin + bufferMin) * 60_000
  const durationMs = durationMin * 60_000
  const minAdvanceHours = botConfig.min_advance_booking_hours ?? 2
  const maxAdvanceDays = botConfig.max_advance_booking_days ?? 60
  const allowSameDay = botConfig.allow_same_day_booking ?? true
  const maxSlots = params.maxSlots ?? 6
  const language = params.language ?? botConfig.ai_language ?? 'pt-BR'

  const now = new Date()
  const earliestSlot = new Date(now.getTime() + minAdvanceHours * 60 * 60_000)
  const latestDate = new Date(now.getTime() + maxAdvanceDays * 24 * 60 * 60_000)

  // Clamp dateTo to maxAdvanceDays
  const effectiveTo = params.dateTo < latestDate ? params.dateTo : latestDate

  const busyBlocks = await fetchBusyBlocks(params.clientId, params.dateFrom, effectiveTo)

  const slots: AvailableSlot[] = []
  let cursor = new Date(params.dateFrom)
  cursor.setUTCMinutes(0, 0, 0)

  while (cursor < effectiveTo && slots.length < maxSlots) {
    const dateStr = tzDateStr(cursor, timezone)
    const dayOfWeek = new Date(cursor.toLocaleString('en-US', { timeZone: timezone })).getDay()
    const dayKey = WEEKDAY_KEYS[dayOfWeek]
    const day: DaySchedule | undefined = botConfig.working_hours[dayKey]

    if (!day?.enabled) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
      continue
    }

    // allow_same_day_booking check
    const todayStr = tzDateStr(now, timezone)
    if (!allowSameDay && dateStr === todayStr) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
      continue
    }

    const workStart = localToUTC(dateStr, day.start, timezone)
    const workEnd = localToUTC(dateStr, day.end, timezone)
    const breakStart = day.break_start ? localToUTC(dateStr, day.break_start, timezone) : null
    const breakEnd = day.break_end ? localToUTC(dateStr, day.break_end, timezone) : null

    let slotStart = workStart
    if (slotStart < earliestSlot) {
      slotStart = roundUpToStep(earliestSlot, stepMs, workStart)
    }

    while (slotStart.getTime() + durationMs <= workEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + durationMs)

      const inBreak = breakStart && breakEnd && slotStart < breakEnd && slotEnd > breakStart

      // Conflito: slot + buffer não pode sobrepor appointment existente
      const slotWithBuffer = new Date(slotEnd.getTime() + bufferMin * 60_000)
      const isBusy = busyBlocks.some((b) => {
        const busyStartWithBuffer = new Date(b.start.getTime() - bufferMin * 60_000)
        return slotStart < b.end && slotWithBuffer > busyStartWithBuffer
      })

      if (!inBreak && !isBusy) {
        slots.push({
          start: toTzISO(slotStart, timezone),
          end: toTzISO(slotEnd, timezone),
          label: formatSlotLabel(slotStart, slotEnd, language, timezone),
        })
        if (slots.length >= maxSlots) break
      }

      slotStart = new Date(slotStart.getTime() + stepMs)
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
    cursor.setUTCHours(0, 0, 0, 0)
  }

  return slots
}

// ---------------------------------------------------------------------------
// validateAppointmentSlot — validação unificada
// ---------------------------------------------------------------------------

export async function validateAppointmentSlot(
  params: ValidateSlotParams,
): Promise<ValidationResult> {
  const botConfig = await resolveBotConfig(params.clientId, params.botConfig)
  if (!botConfig?.working_hours || !botConfig.appointment_duration_default) {
    return { valid: false, reason: 'Configuração de agenda incompleta (working_hours ou duração não definidos)' }
  }

  const timezone = botConfig.timezone ?? 'America/Sao_Paulo'
  const startAt = new Date(params.startAt)
  const endAt = new Date(params.endAt)
  const now = new Date()

  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    return { valid: false, reason: 'Datas inválidas' }
  }

  if (endAt <= startAt) {
    return { valid: false, reason: 'Horário de término deve ser posterior ao início' }
  }

  // 1. min_advance_booking_hours
  const minAdvanceHours = botConfig.min_advance_booking_hours ?? 2
  const earliestAllowed = new Date(now.getTime() + minAdvanceHours * 60 * 60_000)
  if (startAt < earliestAllowed) {
    return { valid: false, reason: `Antecedência mínima de ${minAdvanceHours}h não respeitada` }
  }

  // 2. max_advance_booking_days
  const maxDays = botConfig.max_advance_booking_days ?? 60
  const latestAllowed = new Date(now.getTime() + maxDays * 24 * 60 * 60_000)
  if (startAt > latestAllowed) {
    return { valid: false, reason: `Agendamento não pode ser feito com mais de ${maxDays} dias de antecedência` }
  }

  // 3. allow_same_day_booking
  const allowSameDay = botConfig.allow_same_day_booking ?? true
  const todayStr = tzDateStr(now, timezone)
  const slotDateStr = tzDateStr(startAt, timezone)
  if (!allowSameDay && slotDateStr === todayStr) {
    return { valid: false, reason: 'Agendamento para o mesmo dia não é permitido' }
  }

  // 4. working_hours — dia habilitado?
  const dayOfWeek = new Date(startAt.toLocaleString('en-US', { timeZone: timezone })).getDay()
  const dayKey = WEEKDAY_KEYS[dayOfWeek]
  const day: DaySchedule | undefined = botConfig.working_hours[dayKey]
  if (!day?.enabled) {
    return { valid: false, reason: 'O profissional não atende neste dia da semana' }
  }

  // 5. Slot dentro do horário de trabalho?
  const dateStr = tzDateStr(startAt, timezone)
  const workStart = localToUTC(dateStr, day.start, timezone)
  const workEnd = localToUTC(dateStr, day.end, timezone)
  if (startAt < workStart || endAt > workEnd) {
    return { valid: false, reason: `Horário fora do expediente (${day.start}–${day.end})` }
  }

  // 6. Não cai no intervalo de break?
  if (day.break_start && day.break_end) {
    const breakStart = localToUTC(dateStr, day.break_start, timezone)
    const breakEnd = localToUTC(dateStr, day.break_end, timezone)
    if (startAt < breakEnd && endAt > breakStart) {
      return { valid: false, reason: `Horário conflita com intervalo (${day.break_start}–${day.break_end})` }
    }
  }

  // 7. Conflito com appointments existentes (respeitando buffer)
  const bufferMin = botConfig.appointment_buffer_minutes ?? 0
  const dayStart = localToUTC(dateStr, '00:00', timezone)
  const dayEnd = localToUTC(dateStr, '23:59', timezone)
  const busyBlocks = await fetchBusyBlocks(params.clientId, dayStart, dayEnd, params.ignoreAppointmentId)

  const hasConflict = busyBlocks.some((b) => {
    const busyStartWithBuffer = new Date(b.start.getTime() - bufferMin * 60_000)
    const busyEndWithBuffer = new Date(b.end.getTime() + bufferMin * 60_000)
    return startAt < busyEndWithBuffer && endAt > busyStartWithBuffer
  })

  if (hasConflict) {
    return { valid: false, reason: 'Conflito com outro agendamento existente' }
  }

  return { valid: true }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function roundUpToStep(date: Date, stepMs: number, anchor: Date): Date {
  const offset = (date.getTime() - anchor.getTime()) % stepMs
  if (offset === 0) return new Date(date.getTime())
  return new Date(date.getTime() + (stepMs - offset))
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

function formatSlotLabel(start: Date, end: Date, language: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'long',
  })

  const sp = Object.fromEntries(fmt.formatToParts(start).map((x) => [x.type, x.value]))
  const ep = Object.fromEntries(fmt.formatToParts(end).map((x) => [x.type, x.value]))

  const weekday = sp.weekday.toLowerCase()
  const isEn = !language.startsWith('pt')
  const dayName = isEn ? (DAYS_EN[weekday] ?? weekday) : (DAYS_PT[weekday] ?? weekday)
  const month = isEn ? MONTHS_EN[parseInt(sp.month) - 1] : MONTHS_PT[parseInt(sp.month) - 1]
  const day = parseInt(sp.day)

  const sh = String(parseInt(sp.hour === '24' ? '0' : sp.hour)).padStart(2, '0')
  const sm = sp.minute
  const eh = String(parseInt(ep.hour === '24' ? '0' : ep.hour)).padStart(2, '0')
  const em = ep.minute

  const timeStr = isEn
    ? `${dayName}, ${month} ${day} · ${sh}:${sm}–${eh}:${em}`
    : `${dayName}, ${day}/${month} · ${sh}:${sm}–${eh}:${em}`

  const startISO = toTzISO(start, timezone)
  const endISO = toTzISO(end, timezone)

  return `${timeStr} [${startISO}→${endISO}]`
}
