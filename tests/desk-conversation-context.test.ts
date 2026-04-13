import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConversationContext } from '@/lib/desk/get-conversation-context'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

function makeQuery(singleResult: { data: unknown; error: null }, listResult: { data: unknown; error: null }) {
  const query: any = {
    select() {
      return query
    },
    eq() {
      return query
    },
    neq() {
      return query
    },
    order() {
      return query
    },
    limit() {
      return query
    },
    maybeSingle() {
      return Promise.resolve(singleResult)
    },
    then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(listResult).then(resolve, reject)
    },
  }
  return query
}

function buildAdmin() {
  const currentConversation = {
    id: 'conv-1',
    stage: 'awaiting_human',
    status: 'open',
    labels: ['vip', 'etapa_triagem'],
    summary: 'Paciente com dúvidas sobre preparo',
    last_intent: 'agendamento',
    assigned_operator_id: null,
    last_incoming_at: '2026-04-12T11:40:00Z',
    last_outgoing_at: '2026-04-12T11:10:00Z',
    stage_changed_at: '2026-04-12T11:20:00Z',
    client_id: 'client-1',
    contact_id: 'contact-1',
    followup_cadence: 'lead',
    last_followup_at: '2026-04-12T11:30:00Z',
    appointment_status: 'scheduled',
    journey_stage: 'lead',
    handoff_reason_code: 'medical_urgency',
    handoff_reason_label: 'Urgência médica',
    handoff_transferred_at: '2026-04-12T11:00:00Z',
    handoff_assumed_at: '2026-04-12T11:35:00Z',
    handoff_returned_to_bot_at: null,
    last_system_action: 'manual_followup',
    contacts: [
      {
        id: 'contact-1',
        name: 'Ana Silva',
        phone_number: '5511999999999',
        identifier: '5511999999999@s.whatsapp.net',
        custom_data: { nome: 'Ana', cpf: '123' },
        intake_completed_at: null,
      },
    ],
  }

  const admin = {
    from(table: string) {
      if (table === 'conversations') {
        return makeQuery(
          { data: currentConversation, error: null },
          { data: [{ id: 'conv-history-1', created_at: '2026-04-01T10:00:00Z' }], error: null }
        )
      }

      if (table === 'conversation_events') {
        return makeQuery(
          { data: [], error: null },
          {
            data: [
              {
                id: 'evt-1',
                event_type: 'handoff_assumed',
                event_source: 'desk',
                payload: { by: 'op-1' },
                created_by: 'op-1',
                created_at: '2026-04-12T11:36:00Z',
              },
            ],
            error: null,
          }
        )
      }

      if (table === 'panel_bot_config') {
        return makeQuery(
          {
            data: {
              intake_enabled: true,
              intake_fields: [
                { key: 'nome', label: 'Nome', required: true },
                { key: 'cpf', label: 'CPF', required: true },
              ],
            },
            error: null,
          },
          { data: null, error: null }
        )
      }

      if (table === 'appointments') {
        return makeQuery(
          {
            data: {
              id: 'appt-1',
              title: 'Consulta inicial',
              start_at: '2026-04-13T15:30:00Z',
              end_at: '2026-04-13T16:00:00Z',
              modality: 'online',
              status: 'scheduled',
              meet_link: 'https://meet.example.com/abc',
            },
            error: null,
          },
          { data: [{ id: 'appt-history-1', start_at: '2026-03-20T14:00:00Z' }], error: null }
        )
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return admin
}

describe('getConversationContext', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T12:00:00Z'))
    mocks.createAdminClient.mockReturnValue(buildAdmin())
  })

  it('preserva os campos legados e expõe o statusModel separado por modelo', async () => {
    const context = await getConversationContext('conv-1', 'client-1')

    expect(context).not.toBeNull()
    expect(context).toMatchObject({
      conversationId: 'conv-1',
      clientId: 'client-1',
      header: {
        stage: 'awaiting_human',
        journeyStage: 'lead',
      },
      operational: {
        intakeStatus: 'partial',
        appointmentStatus: 'scheduled',
        followupStatus: 'sent',
        lastSystemAction: 'manual_followup',
      },
      summary: {
        handoffReason: 'Urgência médica',
      },
    })

    expect(context?.statusModel).toMatchObject({
      operational: {
        stage: 'awaiting_human',
        conductionMode: 'aguardando',
        slaStatus: 'warning',
        lastSystemAction: 'manual_followup',
      },
      commercial: {
        labels: ['vip', 'etapa_triagem'],
        journeyStage: 'lead',
      },
    })
    expect(context?.summary.nextStepSuggested?.action).toBe('assume')
    expect(context?.recentEvents).toHaveLength(1)
    expect(context?.history).toMatchObject({
      previousConversationsCount: 1,
      previousAppointmentsCount: 1,
    })
  })
})
