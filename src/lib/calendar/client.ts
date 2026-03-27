// Cria um cliente autenticado do Google Calendar usando as credenciais centrais da Sales Tec.
// Uma única conta Google gerencia todos os calendários — sem OAuth por cliente.

import { google } from 'googleapis'

export type CalendarClient = ReturnType<typeof google.calendar>

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
