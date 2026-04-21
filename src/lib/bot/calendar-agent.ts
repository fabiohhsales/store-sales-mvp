// Calendar Agent: orquestra operações de agenda (check, create, update).
// Chamado pelo dispatcher quando o AI Agent sinaliza intenção de agendamento.
// appointments no Supabase são a fonte de verdade; Google Calendar é sync opcional.

import { parseTimeWindow, formatSlotsMessage } from '@/lib/calendar/slots'
import { getAvailableSlotsFromAppointments } from '@/lib/agenda/availability'
import { createAppointment, rescheduleAppointment } from '@/lib/agenda/commands'
import { sendTextMessage } from '@/lib/api/evolution'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AgentOutput } from './output-schema'
import type { PipelineResult } from './pipeline'

export async function handleAgendaCheck(
  result: PipelineResult,
  output: AgentOutput
): Promise<void> {
  const { clientContext, contact, conversation } = result
  const { botConfig, googleConfig, whatsappConfig } = clientContext

  // Guard: evita reenvio duplicado de lista de slots em janela de 5min
  {
    const supabaseGuard = createAdminClient()
    const { data: convGuard } = await supabaseGuard
      .from('conversations')
      .select('pending_slots, last_outgoing_at')
      .eq('id', conversation.id)
      .single()

    const hasPendingSlots = Array.isArray(convGuard?.pending_slots) && convGuard.pending_slots.length > 0
    const lastOutAt = convGuard?.last_outgoing_at ? new Date(convGuard.last_outgoing_at) : null
    const sentRecently = lastOutAt && (Date.now() - lastOutAt.getTime()) < 5 * 60 * 1000

    if (hasPendingSlots && sentRecently) {
      console.log(`[CalendarAgent] agenda_check ignorado — slots já enviados recentemente para conv=${conversation.id}`)
      return
    }
  }

  // Pré-verificação: paciente já tem appointment futuro nesta conversa?
  {
    const supabaseCheck = createAdminClient()
    const { data: existingAppt } = await supabaseCheck
      .from('appointments')
      .select('start_at, end_at, title')
      .eq('conversation_id', conversation.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existingAppt) {
      const tz = botConfig?.timezone ?? 'America/Sao_Paulo'
      const language = botConfig?.ai_language ?? 'pt-BR'
      const isEn = !language.startsWith('pt')
      const formattedDate = new Date(existingAppt.start_at).toLocaleString(
        isEn ? 'en-US' : 'pt-BR',
        { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }
      )
      const title = existingAppt.title ?? (isEn ? 'appointment' : 'consulta')
      const msg = isEn
        ? `You already have a ${title} scheduled for ${formattedDate}. Would you like to reschedule, or is this about something else?`
        : `Você já tem uma ${title} agendada para ${formattedDate}. Quer reagendar, ou é uma nova consulta?`

      await sendAndSave(whatsappConfig, contact, conversation, msg)
      return
    }
  }

  // Condição de "pode agendar": basta ter working_hours + duração configurados.
  // Google NÃO é pré-requisito para consultar disponibilidade.
  if (!botConfig?.working_hours || !botConfig.appointment_duration_default) {
    await sendAndSave(
      whatsappConfig,
      contact,
      conversation,
      'O agendamento online ainda não está configurado. Entre em contato diretamente para marcar seu horário.'
    )
    return
  }

  try {
    const hint = output.actions.agenda_check.time_window_hint
    const timezone = botConfig.timezone ?? 'America/Sao_Paulo'
    const dateRange = await parseTimeWindow(hint, new Date(), timezone)
    const language = botConfig.ai_language ?? 'pt-BR'

    // Motor de disponibilidade baseado em appointments (não Google freebusy)
    const slots = await getAvailableSlotsFromAppointments({
      clientId: clientContext.clientId,
      dateFrom: dateRange.start,
      dateTo: dateRange.end,
      maxSlots: 6,
      language,
      botConfig,
    })

    // Converte para o formato que formatSlotsMessage espera (TimeSlot)
    const timeSlotsForMessage = slots.map((s) => ({
      startUTC: new Date(s.start),
      endUTC: new Date(s.end),
      label: s.label,
      startISO: s.start,
      endISO: s.end,
    }))

    const message = formatSlotsMessage(timeSlotsForMessage, botConfig.professional_name, language)

    if (slots.length > 0) {
      const supabase = createAdminClient()
      await supabase
        .from('conversations')
        .update({
          pending_slots: slots.map((slot) => ({
            label: slot.label,
            startISO: slot.start,
            endISO: slot.end,
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
  const { botConfig, whatsappConfig } = clientContext
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

  // Resolver start_iso/end_iso via pending_slots quando paciente escolheu por número
  let agendaCreate = agenda_create
  if (agendaCreate.selected_slot_index != null && !agendaCreate.start_iso) {
    const supabaseSlots = createAdminClient()
    const { data: convSlots } = await supabaseSlots
      .from('conversations')
      .select('pending_slots')
      .eq('id', conversation.id)
      .single()

    const pendingSlots = convSlots?.pending_slots as
      | Array<{ startISO: string; endISO: string; label: string }>
      | null
    const chosen = pendingSlots?.[agendaCreate.selected_slot_index - 1]
    if (chosen) {
      agendaCreate = { ...agendaCreate, start_iso: chosen.startISO, end_iso: chosen.endISO }
    }
  }

  if (!agendaCreate.start_iso || !agendaCreate.end_iso) {
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
    const tz = botConfig.timezone ?? 'America/Sao_Paulo'

    // Reagendamento: usa rescheduleAppointment command
    if (agenda_update.should_update) {
      try {
        const rescheduled = await rescheduleAppointment({
          externalEventId: agenda_update.google_event_id ?? null,
          conversationId: conversation.id,
          clientId: clientContext.clientId,
          newStartAt: agendaCreate.start_iso!,
          newEndAt: agendaCreate.end_iso!,
          title: agendaCreate.title ?? null,
        })

        const formattedDate = new Date(agendaCreate.start_iso!).toLocaleString('pt-BR', {
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
      } catch (rescheduleError) {
        // Appointment existente não encontrado — cria novo
        console.warn('[CalendarAgent] Reagendamento falhou, criando novo:', rescheduleError instanceof Error ? rescheduleError.message : rescheduleError)
      }
    }

    // Criação: usa createAppointment command (com validação de slot)
    const inviteeEmail = (contact.custom_data?.email as string | undefined) ?? null

    const appointment = await createAppointment({
      clientId: clientContext.clientId,
      conversationId: conversation.id,
      contactId: contact.id,
      contactName: contact.name ?? 'Paciente',
      contactPhone: contact.phone_number,
      inviteeEmail,
      title: agendaCreate.title ?? null,
      modality: 'presencial',
      status: 'scheduled',
      startAt: agendaCreate.start_iso!,
      endAt: agendaCreate.end_iso!,
      syncToGoogle: true,
      source: 'bot',
    })

    const formattedDate = new Date(agendaCreate.start_iso!).toLocaleString('pt-BR', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    let confirmMsg = `✅ Tudo certo! Sua consulta foi agendada:\n📅 ${formattedDate}\n`
    if (appointment.meet_link) confirmMsg += `🔗 Link da videochamada: ${appointment.meet_link}\n`
    if (appointment.event_url) confirmMsg += `📋 Ver no calendário: ${appointment.event_url}\n`
    if (appointment.sync_status === 'error') {
      console.warn(`[CalendarAgent] sync_status=error silenciado para paciente. appointment=${appointment.id}, error=${appointment.sync_error}`)
    }
    confirmMsg += '\nSe precisar remarcar ou cancelar, é só me avisar! 😊'

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
    const isAuthError = error instanceof Error && /invalid_grant|token.*revoked|token.*expired/i.test(error.message)
    const isValidationError = error instanceof Error && error.message.startsWith('Validação de horário falhou')
    console.error('[CalendarAgent] Erro em handleAgendaCreate:', isAuthError ? `AUTH_FAILURE — ${error.message}` : error)

    const userMessage = isValidationError
      ? `Infelizmente esse horário não está disponível. ${error instanceof Error ? error.message.replace('Validação de horário falhou: ', '') : ''} Quer que eu verifique outros horários?`
      : isAuthError
        ? 'O agendamento online está temporariamente indisponível. Por favor, entre em contato diretamente para marcar seu horário.'
        : 'Ocorreu um erro ao confirmar o agendamento. Nossa equipe entrará em contato para finalizar.'

    await sendAndSave(whatsappConfig, contact, conversation, userMessage)
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
    client_id: conversation.client_id,
    content: message,
    content_type: 'text',
    sender_type: 'agent_bot',
    created_at: new Date().toISOString(),
    from_who: 'ai',
  })
}
