import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  refreshMessageHistory: vi.fn(),
  runAgent: vi.fn(),
  dispatch: vi.fn(),
  emitConversationEvent: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/bot/pipeline', () => ({
  refreshMessageHistory: mocks.refreshMessageHistory,
}))

vi.mock('@/lib/bot/agent', () => ({
  runAgent: mocks.runAgent,
}))

vi.mock('@/lib/bot/dispatcher', () => ({
  dispatch: mocks.dispatch,
}))

vi.mock('@/lib/desk/emit-conversation-event', () => ({
  emitConversationEvent: mocks.emitConversationEvent,
}))

function buildConversationRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'conv-1',
    contact_id: 'contact-1',
    client_id: 'client-1',
    chatwoot_conversation_id: null,
    status: 'open',
    stage: 'bot_triage',
    account_id: null,
    updated_at: '2026-04-12T12:00:00Z',
    chatwoot_contact_id: null,
    labels: [],
    last_incoming_at: '2026-04-12T11:59:00Z',
    last_outgoing_at: null,
    last_outgoing_by: null,
    appointment_status: null,
    followup_cadence: null,
    last_followup_at: null,
    pending_slots: null,
    assigned_operator_id: null,
    resolved_at: null,
    summary: null,
    contacts: [{
      id: 'contact-1',
      chatwoot_id: null,
      name: 'Paciente',
      phone_number: '5511999999999',
      identifier: '5511999999999@s.whatsapp.net',
      client_id: 'client-1',
      created_at: '2026-04-12T11:00:00Z',
      custom_data: null,
      intake_completed_at: null,
    }],
    panel_clients: [{
      panel_whatsapp_config: [{
        id: 'wa-1',
        client_id: 'client-1',
        evolution_instance_name: 'inst-a',
      }],
      panel_bot_config: [{
        id: 'bot-1',
        client_id: 'client-1',
        professional_name: 'Dr. Teste',
      }],
      panel_google_config: [],
    }],
    ...overrides,
  }
}

function buildAdmin(conversationRow = buildConversationRow()) {
  return {
    from(table: string) {
      if (table === 'conversations') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: conversationRow, error: null }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.emitConversationEvent.mockResolvedValue(undefined)
  mocks.runAgent.mockResolvedValue({
    reply: 'Resposta do bot',
    handoff: { needs_human: false, reason: null },
    classification: { stage: null, intent: null },
    labels_next: [],
    status_next: 'open',
    actions: {
      agenda_check: { should_check: false },
      agenda_create: { should_create: false },
    },
    intake_save: null,
    debug: {},
  })
  mocks.dispatch.mockResolvedValue(undefined)
})

describe('resumeConversationFromDesk', () => {
  it('triggers runAgent + dispatch when the latest meaningful message is from the lead', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.refreshMessageHistory.mockResolvedValue([
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        content: 'Preciso de ajuda',
        content_type: 'text',
        sender_type: 'contact',
        from_who: 'lead',
        created_at: '2026-04-12T12:01:00Z',
      },
    ])

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1', {
      triggeredBy: 'op-1',
      previousStage: 'in_service',
    })

    expect(result).toMatchObject({ attempted: true, triggered: true, reason: 'triggered' })
    expect(mocks.runAgent).toHaveBeenCalledTimes(1)
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(mocks.emitConversationEvent).toHaveBeenCalledWith(
      'conv-1',
      'client-1',
      'bot_resume_triggered',
      'system',
      expect.objectContaining({
        reason: 'pending_lead_message',
        previous_stage: 'in_service',
      }),
      'op-1'
    )
  })

  it('skips when the latest meaningful message is from the operator', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.refreshMessageHistory.mockResolvedValue([
      {
        id: 'msg-2',
        conversation_id: 'conv-1',
        content: 'Já vou te responder',
        content_type: 'text',
        sender_type: 'operator',
        from_who: 'human',
        created_at: '2026-04-12T12:02:00Z',
      },
    ])

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1')

    expect(result).toMatchObject({ attempted: false, triggered: false, reason: 'latest_message_from_operator' })
    expect(mocks.runAgent).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('skips when the latest meaningful message is from the bot', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.refreshMessageHistory.mockResolvedValue([
      {
        id: 'msg-3',
        conversation_id: 'conv-1',
        content: 'Posso ajudar em algo mais?',
        content_type: 'text',
        sender_type: 'agent_bot',
        from_who: 'ai',
        created_at: '2026-04-12T12:03:00Z',
      },
    ])

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1')

    expect(result).toMatchObject({ attempted: false, triggered: false, reason: 'latest_message_from_bot' })
    expect(mocks.runAgent).not.toHaveBeenCalled()
  })

  it('skips resolved conversations', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin(buildConversationRow({
      status: 'resolved',
      stage: 'resolved',
    })))

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1')

    expect(result).toMatchObject({ attempted: false, triggered: false, reason: 'conversation_resolved' })
    expect(mocks.refreshMessageHistory).not.toHaveBeenCalled()
  })

  it('skips when bot config is missing', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin(buildConversationRow({
      panel_clients: [{
        panel_whatsapp_config: [{
          id: 'wa-1',
          client_id: 'client-1',
          evolution_instance_name: 'inst-a',
        }],
        panel_bot_config: [],
        panel_google_config: [],
      }],
    })))

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1')

    expect(result).toMatchObject({ attempted: false, triggered: false, reason: 'bot_config_missing' })
    expect(mocks.refreshMessageHistory).not.toHaveBeenCalled()
  })

  it('skips when the stage is no longer bot_triage', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin(buildConversationRow({
      stage: 'in_service',
    })))

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1')

    expect(result).toMatchObject({ attempted: false, triggered: false, reason: 'stage_not_bot_triage' })
    expect(mocks.refreshMessageHistory).not.toHaveBeenCalled()
  })

  it('emits bot_resume_failed when the replay throws', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.refreshMessageHistory.mockResolvedValue([
      {
        id: 'msg-4',
        conversation_id: 'conv-1',
        content: 'Ainda estou esperando',
        content_type: 'text',
        sender_type: 'contact',
        from_who: 'lead',
        created_at: '2026-04-12T12:04:00Z',
      },
    ])
    mocks.runAgent.mockRejectedValue(new Error('llm_down'))

    const { resumeConversationFromDesk } = await import('@/lib/bot/resume-from-desk')
    const result = await resumeConversationFromDesk('conv-1', { triggeredBy: 'op-1' })

    expect(result).toMatchObject({ attempted: true, triggered: false, reason: 'resume_failed' })
    expect(mocks.emitConversationEvent).toHaveBeenCalledWith(
      'conv-1',
      'client-1',
      'bot_resume_failed',
      'system',
      expect.objectContaining({
        reason: 'llm_down',
      }),
      'op-1'
    )
  })
})
