// Cria um cliente autenticado do Google Calendar por cliente.
// Usa o refresh_token armazenado no panel_google_config — googleapis renova o access_token automaticamente.

import { google } from 'googleapis'
import type { PanelGoogleConfig } from '@/types/database'

export type CalendarClient = ReturnType<typeof google.calendar>

export function getCalendarClient(googleConfig: PanelGoogleConfig): CalendarClient {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2.setCredentials({
    refresh_token: googleConfig.refresh_token,
    access_token: googleConfig.access_token ?? undefined,
    expiry_date: googleConfig.token_expiry
      ? new Date(googleConfig.token_expiry).getTime()
      : undefined,
  })

  return google.calendar({ version: 'v3', auth: oauth2 })
}
