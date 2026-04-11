import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST ?? 'smtp.hostinger.com'
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '465', 10)
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER

function getTransport() {
  if (!SMTP_USER || !SMTP_PASS) {
    return null
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
}

function buildIcsContent(options: {
  uid: string
  summary: string
  description: string
  startAt: string
  endAt: string
  timezone: string
  organizerEmail: string
  organizerName: string
  attendees: string[]
}): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dtStart = new Date(options.startAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dtEnd = new Date(options.endAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const attendeeLines = options.attendees
    .map((email) => `ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${email}`)
    .join('\r\n')

  const escapedDesc = options.description
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SalesTec//Painel2//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${options.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${options.summary}`,
    `DESCRIPTION:${escapedDesc}`,
    `ORGANIZER;CN=${options.organizerName}:mailto:${options.organizerEmail}`,
    attendeeLines,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export interface SendInviteOptions {
  appointmentId: string
  summary: string
  description: string
  startAt: string
  endAt: string
  timezone: string
  organizerEmail: string
  organizerName: string
  recipientEmails: string[]
}

export async function sendCalendarInvite(options: SendInviteOptions): Promise<{
  success: boolean
  error: string | null
}> {
  const transport = getTransport()

  if (!transport) {
    return { success: false, error: 'SMTP não configurado (SMTP_USER/SMTP_PASS ausentes)' }
  }

  if (options.recipientEmails.length === 0) {
    return { success: false, error: 'Nenhum destinatário informado' }
  }

  const validEmails = options.recipientEmails.filter((e) => e.includes('@'))
  if (validEmails.length === 0) {
    return { success: false, error: 'Nenhum email válido informado' }
  }

  const icsContent = buildIcsContent({
    uid: `${options.appointmentId}@salestec.app`,
    summary: options.summary,
    description: options.description,
    startAt: options.startAt,
    endAt: options.endAt,
    timezone: options.timezone,
    organizerEmail: options.organizerEmail,
    organizerName: options.organizerName,
    attendees: validEmails,
  })

  try {
    await transport.sendMail({
      from: `"${options.organizerName}" <${SMTP_FROM}>`,
      to: validEmails.join(', '),
      subject: `Convite: ${options.summary}`,
      text: `Você recebeu um convite para: ${options.summary}\n\nInício: ${new Date(options.startAt).toLocaleString('pt-BR')}\nFim: ${new Date(options.endAt).toLocaleString('pt-BR')}\n\n${options.description}`,
      icalEvent: {
        method: 'REQUEST',
        content: icsContent,
      },
    })

    return { success: true, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao enviar email'
    console.error('[email/service] sendCalendarInvite error', message)
    return { success: false, error: message }
  }
}
