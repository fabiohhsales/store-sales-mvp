// Calendar Agent: orquestra operações de agenda (check, create, update).
// Chamado pelo dispatcher quando o AI Agent sinaliza intenção de agendamento.
// appointments no Supabase são a fonte de verdade; Google Calendar é sync opcional.

import { getCalendarClientForConfig } from '@/lib/calendar/client'
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

  const calendarId = googleConfig?.calendar_id
  const calendar = getCalendarClientForConfig(googleConfig ?? null)

  if (!calendar) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'O agendamento online ainda não está disponível. Entre em contato diretamente para marcar seu horário.'
    )
    return
  }

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
    const hint = output.actions.agenda_check.time_window_hint
    const timezone = botConfig.timezone ?? 'America/Sao_Paulo'
    const dateRange = await parseTimeWindow(hint, new Date(), timezone)
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
      botConfig.min_advance_booking_hours ?? 2,
      timezone
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
    const supabase = createAdminClient()

    // Reagendamento: encontra appointment existente e atualiza em vez de criar novo
    if (agenda_update.should_update) {
      let existingId: string | null = null
      let existingExternalEventId: string | null = null

      if (agenda_update.google_event_id) {
        const { data } = await supabase
          .from('appointments')
          .select('id, google_event_id, external_event_id')
          .or(`google_event_id.eq.${agenda_update.google_event_id},external_event_id.eq.${agenda_update.google_event_id}`)
          .maybeSingle()
        existingId = data?.id ?? null
        existingExternalEventId = data?.external_event_id ?? data?.google_event_id ?? null
      }

      if (!existingId) {
        // Fallback: appointment agendado mais recente desta conversa
        const { data } = await supabase
          .from('appointments')
          .select('id, google_event_id, external_event_id')
          .eq('conversation_id', conversation.id)
          .in('status', ['scheduled', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        existingId = data?.id ?? null
        existingExternalEventId = data?.external_event_id ?? data?.google_event_id ?? null
      }

      if (existingId) {
        await supabase
          .from('appointments')
          .update({
            start_at: agenda_create.start_iso,
            end_at: agenda_create.end_iso,
            ...(agenda_create.title ? { title: agenda_create.title } : {}),
            status: 'scheduled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingId)

        // Atualiza evento no Google Calendar se disponível
        const calendarForUpdate = getCalendarClientForConfig(googleConfig ?? null)
        const tz = botConfig?.timezone ?? 'America/Sao_Paulo'
        if (existingExternalEventId && calendarForUpdate && googleConfig?.calendar_id) {
          try {
            await calendarForUpdate.events.patch({
              calendarId: googleConfig.calendar_id,
              eventId: existingExternalEventId,
              requestBody: {
                start: { dateTime: agenda_create.start_iso!, timeZone: tz },
                end: { dateTime: agenda_create.end_iso!, timeZone: tz },
                ...(agenda_create.title ? { summary: agenda_create.title } : {}),
              },
            })
          } catch (calErr) {
            console.error('[CalendarAgent] Falha ao atualizar evento Google no reagendamento:', calErr)
          }
        }

        const startDate = new Date(agenda_create.start_iso!)
        const formattedDate = startDate.toLocaleString('pt-BR', {
          timeZone: tz,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })

        await sendAndSave(
          whatsappConfig,
          contact,
          conversation,
          `Reagendamento confirmado!\n${formattedDate}\nSe precisar remarcar novamente, é só me avisar!`
        )

        await supabase
          .from('conversations')
          .update({
            labels: output.labels_next,
            appointment_status: 'scheduled',
            pending_slots: null,
          })
          .eq('id', conversation.id)

        return
      }

      console.warn('[CalendarAgent] Reagendamento solicitado mas appointment existente não encontrado — criando novo.')
    }

    const appointment = await createAgendaAppointment({
      clientId: clientContext.clientId,
      conversationId: conversation.id,
      contactId: contact.id,
      contactName: contact.name ?? 'Paciente',
      contactPhone: contact.phone_number,
      title: agenda_create.title ?? null,
      modality: 'presencial',
      status: 'scheduled',
      notes: googleConfig?.google_email
        ? `Contato do profissional para convite: ${googleConfig.google_email}`
        : null,
      startAt: agenda_create.start_iso,
      endAt: agenda_create.end_iso,
      syncToGoogle: true,
      source: 'bot',
    })

    const startDate = new Date(agenda_create.start_iso)
    const formattedDate = startDate.toLocaleString('pt-BR', {
      timeZone: botConfig?.timezone ?? 'America/Sao_Paulo',
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

    await supabase
      .from('conversations')
      .update({
        labels: output.labels_next,
        appointment_status: 'scheduled',
        pending_slots: null,
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
    })
    .eq('id', conversation.id)

  await supabase.from('messages').insert({
    id: crypto.randomUUID(),
    conversation_id: conversation.id,
    content: message,
    content_type: 'text',
    sender_type: 'agent_bot',
    created_at: new Date().toISOString(),
    from_who: 'ai',
  })
}
