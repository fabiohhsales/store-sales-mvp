// Cria clientes autenticados do Google Calendar.
// Suporta três modos:
//   google_shared — conta central Sales Tec (GOOGLE_REFRESH_TOKEN global)
//   google_oauth  — conta própria do cliente (refresh_token em panel_google_config)
//   native        — sem Google Calendar (retorna null)

import { google } from 'googleapis'
import type { PanelGoogleConfig } from '@/types/database'

export type CalendarClient = ReturnType<typeof google.calendar>

/** Conta central Sales Tec — usa GOOGLE_REFRESH_TOKEN do ambiente. */
export function getCalendarClient(): CalendarClient {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  return google.calendar({ version: 'v3', auth: oauth2 })
}

/** Token explícito — usado para conta OAuth por cliente. */
export function getCalendarClientWithToken(refreshToken: string): CalendarClient {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2.setCredentials({ refresh_token: refreshToken })

  return google.calendar({ version: 'v3', auth: oauth2 })
}

/**
 * Resolve o cliente de calendário correto com base no calendar_mode do googleConfig.
 * Retorna null quando o modo é 'native' ou os tokens necessários estão ausentes.
 */
export function getCalendarClientForConfig(
  googleConfig: Pick<PanelGoogleConfig, 'calendar_mode' | 'refresh_token'> | null
): CalendarClient | null {
  if (!googleConfig) return null

  const mode = googleConfig.calendar_mode ?? 'google_shared'

  if (mode === 'native') return null

  if (mode === 'google_oauth') {
    if (!googleConfig.refresh_token) return null
    return getCalendarClientWithToken(googleConfig.refresh_token)
  }

  // google_shared (padrão)
  if (!process.env.GOOGLE_REFRESH_TOKEN) return null
  return getCalendarClient()
}
