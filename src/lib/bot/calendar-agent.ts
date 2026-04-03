// Calendar Agent: orquestra operações de agenda (check, create, update).
// Chamado pelo dispatcher quando o AI Agent sinaliza intenção de agendamento.
// appointments no Supabase são a fonte de verdade; Google Calendar é sync opcional.

import { getCalendarClient } from '@/lib/calendar/client'
import { parseTimeWindow, getAvailableSlots, formatSlotsMessage } from '@/lib/calendar/slots'
import { sendTextMessage } from '@/lib/api/evolution'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAgendaAppointment } from '@/lib/agenda/service'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'

export async function handleAgendaCheck(
  result: PipelineResult,
  output: AgentOutput
): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { botConfig, googleConfig, whatsappConfig } = clientContext

  if (!botConfig) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Não foi possível verificar a agenda no momento. Nossa equipe entrará em contato.'
    )
    return
  }

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'O agendamento online ainda não está disponível. Entre em contato diretamente para marcar seu horário.'
    )
    return
  }

  const calendarId = googleConfig?.calendar_id
  if (!calendarId) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'O calendário ainda não foi configurado para este profissional. Entre em contato diretamente para marcar seu horário.'
    )
    return
  }

  try {
    const calendar = getCalendarClient()
    const hint = output.actions.agenda_check.time_window_hint
    const dateRange = await parseTimeWindow(hint)
    const language = botConfig.ai_language ?? 'pt-BR'

    const slots = await getAvailableSlots(
      calendar,
      calendarId,
      dateRange,
      botConfig.working_hours,
      botConfig.appointment_duration_default,
      botConfig.appointment_buffer_minutes ?? 15,
      6,
      language,
      botConfig.min_advance_booking_hours ?? 2
    )

    const message = formatSlotsMessage(slots, botConfig.professional_name, language)

    if (slots.length > 0) {
      const supabase = createAdminClient()
      await supabase
        .from('conversations')
        .update({
          pending_slots: slots.map((slot) => ({
            label: slot.label,
            startISO: slot.startISO,
            endISO: slot.endISO,
          })),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id)
    }

    await sendAndSave(whatsappConfig, contact, conversation, message)
  } catch (error) {
    console.error('[CalendarAgent] Erro em handleAgendaCheck:', error)
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Não consegui verificar a agenda no momento. Por favor, tente novamente em alguns instantes.'
    )
  }
}

export async function handleAgendaCreate(
  result: PipelineResult,
  output: AgentOutput
): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { botConfig, googleConfig, whatsappConfig } = clientContext
  const { agenda_create, agenda_update } = output.actions

  if (!botConfig) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Não foi possível confirmar o agendamento. Nossa equipe entrará em contato.'
    )
    return
  }

  if (!agenda_create.start_iso || !agenda_create.end_iso) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Não consegui identificar o horário. Pode confirmar novamente a data e hora desejada?'
    )
    return
  }

  try {
    const appointment = await createAgendaAppointment({
      clientId: clientContext.clientId,
      conversationId: conversation.id,
      contactId: contact.id,
      contactName: contact.name ?? 'Paciente',
      contactPhone: contact.phone_number,
      title: agenda_create.title ?? null,
      modality: 'presencial',
      status: 'scheduled',
      notes: agenda_update.should_update && agenda_update.google_event_id
        ? `Reagendamento do evento ${agenda_update.google_event_id}`
        : googleConfig?.google_email
          ? `Contato do profissional para convite: ${googleConfig.google_email}`
          : null,
      startAt: agenda_create.start_iso,
      endAt: agenda_create.end_iso,
      syncToGoogle: true,
      source: 'bot',
    })

    const startDate = new Date(agenda_create.start_iso)
    const formattedDate = startDate.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    let confirmMsg = `Consulta agendada com sucesso!\n${formattedDate}\n`
    if (appointment.meet_link) confirmMsg += `Link: ${appointment.meet_link}\n`
    if (appointment.sync_status === 'error') {
      confirmMsg += '\nObservação: o agendamento foi salvo, mas houve falha na sincronização externa.'
    }
    confirmMsg += '\nSe precisar remarcar ou cancelar, é só me avisar!'

    await sendAndSave(whatsappConfig, contact, conversation, confirmMsg)

    const supabase = createAdminClient()
    await supabase
      .from('conversations')
      .update({
        labels: ['etapa_agendado'],
        appointment_status: 'scheduled',
        pending_slots: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
  } catch (error) {
    console.error('[CalendarAgent] Erro em handleAgendaCreate:', error)
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'Ocorreu um erro ao confirmar o agendamento. Nossa equipe entrará em contato para finalizar.'
    )
  }
}

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

  await supabase
    .from('conversations')
    .update({
      last_outgoing_by: 'ai',
      last_outgoing_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

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
