import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
  sendOperationalFollowupMessage: vi.fn(),
  emitConversationEvent: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/followup/shared', () => ({
  sendOperationalFollowupMessage: mocks.sendOperationalFollowupMessage,
}))

vi.mock('@/lib/desk/emit-conversation-event', () => ({
  emitConversationEvent: mocks.emitConversationEvent,
}))

function buildAdmin() {
  return {
    from(table: string) {
      if (table !== 'conversations') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      id: 'conv-1',
                      client_id: 'client-1',
                      contact_id: 'contact-1',
                      stage: 'bot_triage',
                      status: 'open',
                      contacts: [{ phone_number: '5511999999999', identifier: '5511999999999@s.whatsapp.net' }],
                      panel_clients: {
                        panel_whatsapp_config: [{ evolution_instance_name: 'inst-a' }],
                      },
                    },
                    error: null,
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

describe('POST /api/followups/[conversationId]/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'op-1',
      clientId: 'client-1',
      isAdmin: false,
    })
    mocks.createAdminClient.mockReturnValue(buildAdmin())
    mocks.sendOperationalFollowupMessage.mockResolvedValue({
      evolutionMessageId: 'EVO-1',
      sentAt: '2026-04-19T12:00:00Z',
    })
    mocks.emitConversationEvent.mockResolvedValue(undefined)
  })

  it('dispatches a manual follow-up using the shared operational sender', async () => {
    const { POST } = await import('@/app/api/followups/[conversationId]/send/route')

    const response = await POST(
      new NextRequest(
        new Request('https://panel.example.com/api/followups/conv-1/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: 'Oi! Passando para retomar seu atendimento.',
            cadence_type: 'lead',
          }),
        })
      ),
      { params: Promise.resolve({ conversationId: 'conv-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      evolution_message_id: 'EVO-1',
      sent_at: '2026-04-19T12:00:00Z',
    })

    expect(mocks.sendOperationalFollowupMessage).toHaveBeenCalledWith({
      clientId: 'client-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      recipient: '5511999999999@s.whatsapp.net',
      instanceName: 'inst-a',
      cadenceType: 'lead',
      message: 'Oi! Passando para retomar seu atendimento.',
      stepKey: null,
    })

    expect(mocks.emitConversationEvent).toHaveBeenCalledWith(
      'conv-1',
      'client-1',
      'followup_triggered_manual',
      'operator',
      {
        cadence_type: 'lead',
        step_key: null,
        evolution_message_id: 'EVO-1',
      },
      'op-1'
    )
  })
})
