import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  parseTimeWindow: vi.fn(),
  formatSlotsMessage: vi.fn(),
  getAvailableSlotsFromAppointments: vi.fn(),
  createAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  sendTextMessage: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/calendar/slots', () => ({
  parseTimeWindow: mocks.parseTimeWindow,
  formatSlotsMessage: mocks.formatSlotsMessage,
}))

vi.mock('@/lib/agenda/availability', () => ({
  getAvailableSlotsFromAppointments: mocks.getAvailableSlotsFromAppointments,
}))

vi.mock('@/lib/agenda/commands', () => ({
  createAppointment: mocks.createAppointment,
  rescheduleAppointment: mocks.rescheduleAppointment,
}))

vi.mock('@/lib/api/evolution', () => ({
  sendTextMessage: mocks.sendTextMessage,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { handleAgendaCheck, handleAgendaCreate } from '@/lib/bot/calendar-agent'

type QueryState = {
  table: string
  selectColumns: string | null
  updatePayload: Record<string, unknown> | null
  filters: Record<string, unknown>
}

function buildResult() {
  return {
    clientContext: {
      clientId: 'client-1',
      whatsappConfig: { evolution_instance_name: 'inst-1' },
      googleConfig: null,
      botConfig: {
        professional_name: 'Dra. Fernanda Souza',
        ai_language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        appointment_duration_default: 60,
        working_hours: {},
      },
    },
    contact: {
      id: 'contact-1',
      name: 'Maria',
      phone_number: '5511999999999',
      identifier: '5511999999999@s.whatsapp.net',
      custom_data: {},
    },
    conversation: {
      id: 'conv-1',
      client_id: 'client-1',
      labels: ['etapa_triagem'],
      status: 'pending',
    },
  } as any
}

function buildAdmin(resolvers?: {
  onSingle?: (state: QueryState) => Promise<{ data: any; error: any }> | { data: any; error: any }
  onMaybeSingle?: (state: QueryState) => Promise<{ data: any; error: any }> | { data: any; error: any }
}) {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; payload: unknown }> = []

  const admin = {
    from(table: string) {
      const state: QueryState = {
        table,
        selectColumns: null,
        updatePayload: null,
        filters: {},
      }

      const builder = {
        select(columns: string) {
          state.selectColumns = columns
          return builder
        },
        eq(field: string, value: unknown) {
          state.filters[field] = value
          if (state.updatePayload) {
            updates.push({ table, payload: state.updatePayload, filters: { ...state.filters } })
            return Promise.resolve({ data: null, error: null })
          }
          return builder
        },
        in(field: string, value: unknown) {
          state.filters[`in:${field}`] = value
          return builder
        },
        gte(field: string, value: unknown) {
          state.filters[`gte:${field}`] = value
          return builder
        },
        order(field: string, value: unknown) {
          state.filters[`order:${field}`] = value
          return builder
        },
        limit(value: number) {
          state.filters.limit = value
          return builder
        },
        update(payload: Record<string, unknown>) {
          state.updatePayload = payload
          return builder
        },
        insert(payload: unknown) {
          inserts.push({ table, payload })
          return Promise.resolve({ data: null, error: null })
        },
        single() {
          return Promise.resolve(resolvers?.onSingle?.(state) ?? { data: null, error: null })
        },
        maybeSingle() {
          return Promise.resolve(resolvers?.onMaybeSingle?.(state) ?? { data: null, error: null })
        },
      }

      return builder
    },
  }

  return { admin, updates, inserts }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('calendar-agent agenda rescue behaviors', () => {
  it('resolves selected_slot_index via pending_slots and hides sync_status errors from the patient', async () => {
    const pendingSlots = [
      { label: '1', startISO: '2026-04-21T09:00:00-03:00', endISO: '2026-04-21T10:00:00-03:00' },
      { label: '2', startISO: '2026-04-21T11:00:00-03:00', endISO: '2026-04-21T12:00:00-03:00' },
    ]
    const { admin, updates, inserts } = buildAdmin({
      onSingle: (state) => {
        if (state.table === 'conversations' && state.selectColumns === 'pending_slots') {
          return { data: { pending_slots: pendingSlots }, error: null }
        }
        return { data: null, error: null }
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.createAppointment.mockResolvedValue({
      id: 'appt-1',
      meet_link: null,
      event_url: null,
      sync_status: 'error',
      sync_error: 'oauth_issue',
    })

    await handleAgendaCreate(
      buildResult(),
      {
        labels_next: ['etapa_agendando'],
        actions: {
          agenda_create: {
            should_create: true,
            start_iso: null,
            end_iso: null,
            title: 'Consulta',
            selected_slot_index: 2,
          },
          agenda_update: { should_update: false, google_event_id: null },
        },
      } as any
    )

    expect(mocks.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: pendingSlots[1].startISO,
        endAt: pendingSlots[1].endISO,
      })
    )
    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTextMessage.mock.calls[0]?.[2]).not.toContain('falha ao sincronizar')
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'conversations',
          payload: expect.objectContaining({
            appointment_status: 'scheduled',
            pending_slots: null,
          }),
        }),
      ])
    )
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'messages',
        }),
      ])
    )
  })

  it('asks about rescheduling before checking availability when a future appointment already exists', async () => {
    const { admin } = buildAdmin({
      onSingle: (state) => {
        if (state.table === 'conversations' && state.selectColumns === 'pending_slots, last_outgoing_at') {
          return { data: { pending_slots: null, last_outgoing_at: '2026-04-19T12:00:00Z' }, error: null }
        }
        return { data: null, error: null }
      },
      onMaybeSingle: (state) => {
        if (state.table === 'appointments') {
          return {
            data: {
              start_at: '2026-04-22T12:00:00Z',
              end_at: '2026-04-22T13:00:00Z',
              title: 'consulta',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    await handleAgendaCheck(
      buildResult(),
      {
        actions: {
          agenda_check: { should_check: true, time_window_hint: 'amanhã' },
        },
      } as any
    )

    expect(mocks.getAvailableSlotsFromAppointments).not.toHaveBeenCalled()
    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTextMessage.mock.calls[0]?.[2]).toContain('Quer reagendar')
  })

  it('skips duplicate agenda_check calls when pending slots were already sent recently', async () => {
    const { admin } = buildAdmin({
      onSingle: (state) => {
        if (state.table === 'conversations' && state.selectColumns === 'pending_slots, last_outgoing_at') {
          return {
            data: {
              pending_slots: [{ startISO: '2026-04-21T09:00:00-03:00', endISO: '2026-04-21T10:00:00-03:00', label: '1' }],
              last_outgoing_at: new Date().toISOString(),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })
    mocks.createAdminClient.mockReturnValue(admin)

    await handleAgendaCheck(
      buildResult(),
      {
        actions: {
          agenda_check: { should_check: true, time_window_hint: 'amanhã' },
        },
      } as any
    )

    expect(mocks.getAvailableSlotsFromAppointments).not.toHaveBeenCalled()
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })
})
