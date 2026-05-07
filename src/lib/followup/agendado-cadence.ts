import { createAdminClient } from '@/lib/supabase/admin'
import { isWithinWorkingHours, logFollowupSkip } from '@/lib/followup/business-hours'
import {
  resolveAgendadoSteps,
  renderTemplate,
  sendFollowupMessage,
  logFollowupEvent,
  FollowupCircuitBreaker,
  isWhatsAppConnected,
} from '@/lib/followup/shared'
import type { PanelBotConfig, PanelWhatsAppConfig, AgendadoFollowupStepConfig } from '@/types/database'
import { normalizeAgendaStatus } from '@/lib/agenda/constants'
import { upsertConversationFollowupState } from './state'
import { recordFollowupSent, recordFollowupSkipped } from './events'

interface AppointmentRow {
  id: string
  conversation_id: string
  contact_id: string
  start_at: string
  end_at: string
  status: string | null
  meet_link: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_identifier: string | null
}

interface ClientFollowupContext {
  clientId: string
  botConfig: PanelBotConfig
  whatsappConfig: PanelWhatsAppConfig
}

export interface AgendadoCadenceSummary {
  clients: number
  stepsSent: number
  skippedOutsideHours: boolean
}

function buildTemplateVars(config: PanelBotConfig, appointment: AppointmentRow) {
  const start = new Date(appointment.start_at)
  const tz = config.timezone ?? 'America/Sao_Paulo'
  return {
    patient_name: appointment.contact_name ?? 'Paciente',
    professional_name: config.professional_name,
    business_name: config.business_name ?? config.professional_name,
    date: new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(start),
    time: new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(start),
    day_of_week: new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long' }).format(start),
    meet_link: appointment.meet_link ?? '',
  }
}

function resolveAgendadoStepKey(
  startAt: string,
  steps: AgendadoFollowupStepConfig[]
): { stepKey: string; template: string } | null {
  const hoursBefore = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60)
  const match = steps.find((step) => hoursBefore >= step.min_hours_before && hoursBefore < step.max_hours_before)
  return match ? { stepKey: match.step_key, template: match.template } : null
}

async function queryUpcomingAppointments(clientId: string): Promise<AppointmentRow[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 51 * 60 * 60 * 1000)

  const { data: appts, error } = await supabase
    .from('appointments')
    .select(`
      id, conversation_id, contact_id, start_at, end_at, status, meet_link,
      conversations!inner(client_id)
    `)
    .gt('start_at', now.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .eq('conversations.client_id', clientId)
    .limit(200)

  if (error) throw error

  // Filtrar appointments cujas conversas estão suprimidas para agendado
  const suppressed = await import('./shared').then(m => m.getSuppressedConversations(clientId, 'agendado'));

  const scheduledAppointments = (appts ?? []).filter((a) => normalizeAgendaStatus(a.status) === 'scheduled' && !suppressed.has(a.conversation_id))
  if (!scheduledAppointments.length) return []

  const contactIds = [...new Set(scheduledAppointments.map((a: { contact_id: string }) => a.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number, identifier')
    .in('id', contactIds)

  const contactMap = new Map((contacts ?? []).map((c: { id: string }) => [c.id, c]))

  return scheduledAppointments.map((appointment: Record<string, unknown>) => {
    const contact = contactMap.get(appointment.contact_id as string) as {
      name?: string | null
      phone_number?: string | null
      identifier?: string | null
    } | undefined

    return {
      id: appointment.id as string,
      conversation_id: appointment.conversation_id as string,
      contact_id: appointment.contact_id as string,
      start_at: appointment.start_at as string,
      end_at: appointment.end_at as string,
      status: (appointment.status as string | null) ?? null,
      meet_link: (appointment.meet_link as string | null) ?? null,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone_number ?? null,
      contact_identifier: contact?.identifier ?? null,
    }
  })
}

async function processClient(ctx: ClientFollowupContext, breaker: FollowupCircuitBreaker) {
  if (!isWithinWorkingHours(ctx.botConfig.working_hours, ctx.botConfig.timezone ?? 'America/Sao_Paulo')) {
    logFollowupSkip('agendado', 'fora_do_horario', { clientId: ctx.clientId })
    return 0
  }

  const steps = resolveAgendadoSteps(ctx.botConfig)
  if (!steps.length) {
    logFollowupEvent('agendado', 'skipped', { clientId: ctx.clientId, reason: 'no_enabled_steps' })
    return 0
  }

  const appointments = await queryUpcomingAppointments(ctx.clientId)
  let sentCount = 0

  for (const appointment of appointments) {
    if (breaker.isOpen(ctx.clientId)) {
      logFollowupEvent('agendado', 'circuit_open', { clientId: ctx.clientId })
      break
    }

    const resolved = resolveAgendadoStepKey(appointment.start_at, steps)
    if (!resolved) {
      logFollowupSkip('agendado', 'sem_step_elegivel', {
        clientId: ctx.clientId,
        appointmentId: appointment.id,
      })
      
      // Fase 1: Registrar evento de skip
      await recordFollowupSkipped({
        clientId: ctx.clientId,
        conversationId: appointment.conversation_id,
        contactId: appointment.contact_id,
        cadenceType: 'agendado',
        reasonCode: 'sem_step_elegivel',
        reasonLabel: 'Nenhum step elegível no momento'
      })
      
      continue
    }

    const recipient = appointment.contact_identifier ?? appointment.contact_phone
    if (!recipient) continue

    const message = renderTemplate(resolved.template, buildTemplateVars(ctx.botConfig, appointment))

    try {
      const sent = await sendFollowupMessage({
        clientId: ctx.clientId,
        conversationId: appointment.conversation_id,
        contactId: appointment.contact_id,
        recipient,
        instanceName: ctx.whatsappConfig.evolution_instance_name,
        cadenceType: 'agendado',
        stepKey: resolved.stepKey,
        message,
      })
      if (sent) {
        sentCount++
        breaker.recordSuccess(ctx.clientId)
        
        // Fase 1: Registrar evento de envio + atualizar estado
        await recordFollowupSent({
          clientId: ctx.clientId,
          conversationId: appointment.conversation_id,
          contactId: appointment.contact_id,
          cadenceType: 'agendado',
          stepKey: resolved.stepKey,
          message
        })
        
        await upsertConversationFollowupState({
          client_id: ctx.clientId,
          conversation_id: appointment.conversation_id,
          contact_id: appointment.contact_id,
          state: 'active',
          cadence_type: 'agendado',
          current_step_key: resolved.stepKey,
          current_step_label: `Agendado ${resolved.stepKey}`,
          total_attempts: 1,
          last_sent_at: new Date().toISOString(),
          last_evaluated_at: new Date().toISOString()
        })
      }
    } catch (error) {
      breaker.recordFailure(ctx.clientId)
      console.error(`[Followup Agendado] Erro para appointment=${appointment.id}:`, error)
    }
  }

  return sentCount
}

export async function runAgendadoCadencePipeline(
  targetClientId?: string
): Promise<AgendadoCadenceSummary> {
  const supabase = createAdminClient()
  let query = supabase
    .from('panel_bot_config')
    .select('*, panel_clients!inner(id, status), panel_whatsapp_config(*)')
    .eq('followup_enabled', true)
    .eq('panel_clients.status', 'active')
    .limit(200)

  if (targetClientId) {
    query = query.eq('client_id', targetClientId)
  }

  const { data: rows, error } = await query

  if (error) throw error
  if (!rows?.length) return { clients: 0, stepsSent: 0, skippedOutsideHours: false }

  const breaker = new FollowupCircuitBreaker()
  let totalSent = 0

  for (const row of rows) {
    const whatsappConfig = Array.isArray(row.panel_whatsapp_config) ? row.panel_whatsapp_config[0] : row.panel_whatsapp_config
    if (!whatsappConfig || !isWhatsAppConnected(whatsappConfig as PanelWhatsAppConfig)) {
      logFollowupSkip('agendado', 'sem_whatsapp_config', { clientId: row.client_id as string })
      continue
    }

    try {
      totalSent += await processClient(
        {
          clientId: row.client_id as string,
          botConfig: row as PanelBotConfig,
          whatsappConfig: whatsappConfig as PanelWhatsAppConfig,
        },
        breaker
      )
    } catch (error) {
      console.error(`[Followup Agendado] Erro para client=${row.client_id}:`, error)
    }
  }

  return { clients: rows.length, stepsSent: totalSent, skippedOutsideHours: false }
}
