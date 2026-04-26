import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineResult } from '@/lib/bot/pipeline'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendTextMessage: vi.fn(),
  getAvailableSlotsFromAppointments: vi.fn(),
  createAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/api/evolution', () => ({
  sendTextMessage: mocks.sendTextMessage,
}))

vi.mock('@/lib/agenda/availability', () => ({
  getAvailableSlotsFromAppointments: mocks.getAvailableSlotsFromAppointments,
}))

vi.mock('@/lib/agenda/commands', () => ({
  createAppointment: mocks.createAppointment,
  rescheduleAppointment: mocks.rescheduleAppointment,
}))

import { handleAgendaCheck, handleAgendaCreate } from '@/lib/bot/calendar-agent'

function buildResult(): PipelineResult {
  return {
    clientContext: {
      clientId: 'client-1',
      botConfig: {
        timezone: 'America/Sao_Paulo',
        ai_language: 'pt-BR',
        professional_name: 'Dra. Clara Souza',
        working_hours: {
          monday: { enabled: true, start: '09:00', end: '18:00', break_start: null, break_end: null },
        },
        appointment_duration_default: 30,
      },
      googleConfig: null,
      whatsappConfig: {
        evolution_instance_name: 'inst-1',
      },
    },
    contact: {
      id: 'contact-1',
      name: 'Maria',
      phone_number: '5511999999999',
      identifier: '5511999999999@s.whatsapp.net',
      custom_data: { email: 'maria@example.com' },
    },
    conversation: {
      id: 'conv-1',
      client_id: 'client-1',
      contact_id: 'contact-1',
      stage: 'bot_triage',
      status: 'open',
      labels: ['etapa_agendando'],
      pending_slots: null,
    },
    message: null,
    messageHistory: [],
  } as unknown as PipelineResult
}

function makeConversationSelectAdmin(data: unknown) {
  return {
    from(table: string) {
      expect(table).toBe('conversations')
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return { data, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

function makeAppointmentLookupAdmin(data: unknown) {
  return {
    from(table: string) {
      expect(table).toBe('appointments')
      return {
        select() {
          return {
            eq() {
              return {
                in() {
                  return {
                    gte() {
                      return {
                        order() {
                          return {
                            limit() {
                              return {
                                async maybeSingle() {
                                  return { data, error: null }
                                },
                              }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

function makeSendAndSaveAdmin() {
  const updates: Array<Record<string, unknown>> = []
  const messages: Array<Record<string, unknown>> = []

  return {
    admin: {
      from(table: string) {
        if (table === 'conversations') {
          return {
            update(payload: Record<string, unknown>) {
              updates.push(payload)
              return {
                eq() {
                  return Promise.resolve({ data: null, error: null })
                },
              }
            },
          }
        }

        if (table === 'messages') {
          return {
            insert(payload: Record<string, unknown>) {
              messages.push(payload)
              return Promise.resolve({ data: null, error: null })
            },
          }
        }

        throw new Error(`Unexpected table in sendAndSave admin: ${table}`)
      },
    },
    updates,
    messages,
  }
}

function makeConversationUpdateAdmin() {
  const updates: Array<Record<string, unknown>> = []

  return {
    admin: {
      from(table: string) {
        expect(table).toBe('conversations')
        return {
          update(payload: Record<string, unknown>) {
            updates.push(payload)
            return {
              eq() {
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    },
    updates,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.sendTextMessage.mockResolvedValue('evo-1')
  mocks.getAvailableSlotsFromAppointments.mockResolvedValue([])
  mocks.createAppointment.mockResolvedValue({
    id: 'appt-1',
    meet_link: null,
    event_url: 'https://calendar.example.com/appt-1',
    sync_status: 'synced',
    sync_error: null,
  })
  mocks.rescheduleAppointment.mockResolvedValue({ id: 'appt-1' })
})

describe('calendar-agent', () => {
  it('ignores agenda_check when pending slots were already sent in the last 5 minutes', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeConversationSelectAdmin({
        pending_slots: [{ label: '1', startISO: '2026-04-22T10:00:00-03:00', endISO: '2026-04-22T10:30:00-03:00' }],
        last_outgoing_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      })
    )

    await handleAgendaCheck(buildResult(), {
      actions: {
        agenda_check: { should_check: true, time_window_hint: 'amanhã' },
      },
    } as never)

    expect(mocks.getAvailableSlotsFromAppointments).not.toHaveBeenCalled()
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })

  it('asks for clarification instead of reopening availability when an upcoming appointment already exists', async () => {
    const sendAndSave = makeSendAndSaveAdmin()
    mocks.createAdminClient
      .mockReturnValueOnce(
        makeConversationSelectAdmin({
          pending_slots: null,
          last_outgoing_at: null,
        })
      )
      .mockReturnValueOnce(
        makeAppointmentLookupAdmin({
          start_at: '2026-04-25T14:00:00Z',
          end_at: '2026-04-25T14:30:00Z',
          title: 'Consulta de retorno',
        })
      )
      .mockReturnValueOnce(sendAndSave.admin)

    await handleAgendaCheck(buildResult(), {
      actions: {
        agenda_check: { should_check: true, time_window_hint: 'amanhã' },
      },
    } as never)

    expect(mocks.getAvailableSlotsFromAppointments).not.toHaveBeenCalled()
    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTextMessage.mock.calls[0][2]).toContain('Quer reagendar')
    expect(sendAndSave.messages).toHaveLength(1)
  })

  it('resolves selected_slot_index from pending_slots before creating the appointment', async () => {
    const pendingSlotsAdmin = makeConversationSelectAdmin({
      pending_slots: [
        { label: '1. Quarta 09:00', startISO: '2026-04-22T09:00:00-03:00', endISO: '2026-04-22T09:30:00-03:00' },
        { label: '2. Quarta 10:00', startISO: '2026-04-22T10:00:00-03:00', endISO: '2026-04-22T10:30:00-03:00' },
      ],
    })
    const conversationUpdate = makeConversationUpdateAdmin()
    const sendAndSave = makeSendAndSaveAdmin()

    mocks.createAdminClient
      .mockReturnValueOnce(pendingSlotsAdmin)
      .mockReturnValueOnce(conversationUpdate.admin)
      .mockReturnValueOnce(sendAndSave.admin)

    await handleAgendaCreate(buildResult(), {
      labels_next: ['etapa_agendado'],
      actions: {
        agenda_create: {
          should_create: true,
          start_iso: null,
          end_iso: null,
          title: null,
          selected_slot_index: 2,
        },
        agenda_update: { should_update: false, google_event_id: null },
      },
    } as never)

    expect(mocks.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: '2026-04-22T10:00:00-03:00',
        endAt: '2026-04-22T10:30:00-03:00',
      })
    )
    expect(sendAndSave.messages).toHaveLength(1)
    expect(conversationUpdate.updates).toContainEqual(
      expect.objectContaining({
        labels: ['etapa_agendado'],
        appointment_status: 'scheduled',
        pending_slots: null,
      })
    )
  })
})
