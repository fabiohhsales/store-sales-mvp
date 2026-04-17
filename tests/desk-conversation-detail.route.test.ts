import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  applyRateLimit: vi.fn(() => null),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
  applyRateLimit: mocks.applyRateLimit,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { GET } from '@/app/api/desk/conversations/[id]/route'

function makeRequest(url = 'https://panel.example.com/api/desk/conversations/conv-1') {
  return new NextRequest(new Request(url))
}

describe('GET /api/desk/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns multimodal-derived fields in the message payload', async () => {
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'op-1',
      clientId: 'client-1',
      isAdmin: false,
    })

    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'conversations') {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          id: 'conv-1',
                          stage: 'bot_triage',
                          status: 'open',
                          labels: ['etapa_triagem'],
                          summary: null,
                          assigned_operator_id: null,
                          last_incoming_at: null,
                          last_outgoing_at: null,
                          stage_changed_at: null,
                          client_id: 'client-1',
                          journey_stage: null,
                          handoff_reason_code: null,
                          handoff_reason_label: null,
                          handoff_transferred_at: null,
                          handoff_returned_to_bot_at: null,
                          last_system_action: null,
                          contacts: { id: 'contact-1', name: 'Paciente', phone_number: '5511999999999', identifier: '5511999999999@s.whatsapp.net', custom_data: null },
                        },
                        error: null,
                      }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'messages') {
          return {
            select() {
              return {
                eq() {
                  return {
                    or() {
                      return this
                    },
                    order() {
                      return {
                        async limit() {
                          return {
                            data: [
                              {
                                id: 'msg-1',
                                content: '[Imagem]',
                                content_type: 'image',
                                sender_type: 'contact',
                                from_who: 'lead',
                                created_at: '2026-04-15T12:00:00Z',
                                evolution_message_id: 'evo-img-1',
                                media_url: 'client-1/conv-1/evo-img-1.jpeg',
                                media_mime_type: 'image/jpeg',
                                media_filename: null,
                                media_size_bytes: 1024,
                                media_duration_seconds: null,
                                media_transcript: null,
                                whatsapp_status: null,
                                derived_text: 'Exame fotografado com texto legível.',
                                derived_kind: 'vision_analysis',
                                processing_status: 'processed',
                                processing_error: null,
                                ai_input_text: 'Descrição da imagem enviada pelo contato: Exame fotografado com texto legível.',
                                sent_to_agent_at: '2026-04-15T12:00:05Z',
                              },
                            ],
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

        throw new Error(`Unexpected table: ${table}`)
      },
    })

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: 'conv-1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.messages[0]).toMatchObject({
      derived_text: 'Exame fotografado com texto legível.',
      derived_kind: 'vision_analysis',
      processing_status: 'processed',
      processing_error: null,
      ai_input_text: 'Descrição da imagem enviada pelo contato: Exame fotografado com texto legível.',
      sent_to_agent_at: '2026-04-15T12:00:05Z',
    })
  })
})
