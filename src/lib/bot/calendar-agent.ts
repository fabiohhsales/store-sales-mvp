// Calendar Agent: orquestra operações de agenda (check, create, update).
// Chamado pelo dispatcher quando o AI Agent sinaliza intenção de agendamento.
// Usa conta Google central da Sales Tec — sem OAuth por cliente.

import { getCalendarClient } from '@/lib/calendar/client'
import {
  parseTimeWindow,
  getAvailableSlots,
  formatSlotsMessage,
} from '@/lib/calendar/slots'
import {
  createAppointment,
  updateAppointmentEvent,
  deleteAppointmentEvent,
  getAppointmentByEventId,
} from '@/lib/calendar/events'
import { sendTextMessage } from '@/lib/api/evolution'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'

// Verifica disponibilidade e envia horários disponíveis para o paciente
export async function handleAgendaCheck(
  result: PipelineResult,
  output: AgentOutput
): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { botConfig, googleConfig, whatsappConfig } = clientContext

  if (!botConfig) {
    console.warn('[CalendarAgent] Sem panel_bot_config para client:', clientContext.clientId)
    return
  }

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.warn('[CalendarAgent] GOOGLE_REFRESH_TOKEN não configurado')
    return
  }

  const calendarId = googleConfig?.calendar_id ?? 'primary'

  try {
    const calendar = getCalendarClient()
    const hint = output.actions.agenda_check.time_window_hint
    const dateRange = await parseTimeWindow(hint)

    const slots = await getAvailableSlots(
      calendar,
      calendarId,
      dateRange,
      botConfig.working_hours,
      botConfig.appointment_duration_default,
      botConfig.appointment_buffer_minutes ?? 15
    )

    const message = formatSlotsMessage(slots, botConfig.professional_name)
    await sendAndSave(whatsappConfig, contact, conversation, message)

    console.log(`[CalendarAgent] check concluído para conv=${conversation.id}: ${slots.length} slots`)
  } catch (err) {
    console.error('[CalendarAgent] Erro em handleAgendaCheck:', err)
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Não consegui verificar a agenda no momento. Por favor, tente novamente em alguns instantes.'
    )
  }
}

// Cria evento no Google Calendar com o horário confirmado pelo paciente
export async function handleAgendaCreate(
  result: PipelineResult,
  output: AgentOutput
): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { botConfig, googleConfig, whatsappConfig } = clientContext
  const { agenda_create, agenda_update } = output.actions

  if (!botConfig) {
    console.warn('[CalendarAgent] Sem panel_bot_config para client:', clientContext.clientId)
    return
  }

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.warn('[CalendarAgent] GOOGLE_REFRESH_TOKEN não configurado')
    return
  }

  if (!agenda_create.start_iso || !agenda_create.end_iso) {
    console.warn('[CalendarAgent] start_iso/end_iso ausentes para conv:', conversation.id)
    return
  }

  const calendarId = googleConfig?.calendar_id ?? 'primary'
  const clientEmail = googleConfig?.google_email ?? null

  try {
    const calendar = getCalendarClient()

    // Se é reagendamento: cancela o evento anterior antes de criar o novo
    if (agenda_update.should_update && agenda_update.google_event_id) {
      const existing = await getAppointmentByEventId(agenda_update.google_event_id)
      if (existing) {
        await deleteAppointmentEvent(calendar, calendarId, agenda_update.google_event_id)
        console.log(`[CalendarAgent] Evento anterior ${agenda_update.google_event_id} cancelado (reagendamento)`)
      }
    }

    // Cria novo evento com convite ao profissional
    const { appointment, meetLink } = await createAppointment(calendar, {
      calendarId,
      conversationId: conversation.id,
      contactId: contact.id,
      patientName: contact.name ?? 'Paciente',
      patientPhone: contact.phone_number,
      clientEmail,
      startISO: agenda_create.start_iso,
      endISO: agenda_create.end_iso,
      config: botConfig,
    })

    // Monta mensagem de confirmação
    const startDate = new Date(agenda_create.start_iso)
    const formattedDate = startDate.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    let confirmMsg = `✅ Consulta agendada com sucesso!\n📅 ${formattedDate}\n`
    if (meetLink) confirmMsg += `🔗 Link: ${meetLink}\n`
    confirmMsg += `\nSe precisar remarcar ou cancelar, é só me avisar!`

    await sendAndSave(whatsappConfig, contact, conversation, confirmMsg)

    // Atualiza status da conversa para etapa_agendado
    const supabase = createAdminClient()
    await supabase
      .from('conversations')
      .update({
        labels: ['etapa_agendado'],
        appointment_status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)

    console.log(`[CalendarAgent] Evento criado ${appointment.google_event_id} para conv=${conversation.id}`)
  } catch (err) {
    console.error('[CalendarAgent] Erro em handleAgendaCreate:', err)
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Ocorreu um erro ao confirmar o agendamento. Nossa equipe entrará em contato para finalizar.'
    )
  }
}

// Envia mensagem via WhatsApp e salva no histórico
async function sendAndSave(
  whatsappConfig: PipelineResult['clientContext']['whatsappConfig'],
  contact: PipelineResult['contact'],
  conversation: PipelineResult['conversation'],
  message: string
): Promise<void> {
  const identifier = contact.identifier ?? contact.phone_number
  if (!identifier || !whatsappConfig.evolution_instance_name) return

  await sendTextMessage(whatsappConfig.evolution_instance_name, identifier, message)

  const supabase = createAdminClient()
  await supabase.from('messages').insert({
    id: crypto.randomUUID(),
    chatwoot_message_id: 0,
    conversation_id: conversation.id,
    content: message,
    content_type: 'text',
    sender_type: 'agent_bot',
    created_at: new Date().toISOString(),
    from_who: 'ai',
    chatwoot_conversation_id: String(conversation.chatwoot_conversation_id),
    source_id: null,
  })
}
