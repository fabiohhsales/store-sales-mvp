import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineResult } from '@/lib/bot/pipeline'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  runAgent: vi.fn(),
  refreshMessageHistory: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/bot/dispatcher', () => ({
  dispatch: mocks.dispatch,
}))

vi.mock('@/lib/bot/agent', () => ({
  runAgent: mocks.runAgent,
}))

vi.mock('@/lib/bot/pipeline', () => ({
  refreshMessageHistory: mocks.refreshMessageHistory,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { runConversationBotTurn } from '@/lib/bot/run-conversation-turn'

function buildResult(overrides?: {
  message?: Record<string, unknown>
  messageHistory?: Array<Record<string, unknown>>
}): PipelineResult {
  const message = {
    id: 'msg-1',
    conversation_id: 'conv-1',
    evolution_message_id: 'evo-1',
    content: 'Olá',
    content_type: 'text',
    sender_type: 'contact',
    from_who: 'lead',
    ai_input_text: 'Olá',
    media_transcript: null,
    processing_status: 'not_required',
    processing_error: null,
    derived_kind: null,
    created_at: '2026-04-15T12:00:00Z',
    client_id: 'client-1',
  }

  return {
    clientContext: {
      clientId: 'client-1',
      whatsappConfig: { evolution_instance_name: 'inst-1' },
      botConfig: { stage_labels: [], ai_handoff_message: 'fallback handoff' },
      googleConfig: null,
    },
    contact: {
      id: 'contact-1',
      name: 'Paciente',
      phone_number: '5511999999999',
      identifier: '5511999999999@s.whatsapp.net',
    },
    conversation: {
      id: 'conv-1',
      client_id: 'client-1',
      stage: 'bot_triage',
      labels: ['etapa_triagem'],
      status: 'open',
    },
    message: { ...message, ...(overrides?.message ?? {}) },
    messageHistory: (overrides?.messageHistory ?? [{ ...message, ...(overrides?.message ?? {}) }]) as unknown as PipelineResult['messageHistory'],
  } as unknown as PipelineResult
}

describe('runConversationBotTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('short-circuits to safe handoff when multimodal processing failed', async () => {
    const result = buildResult({
      message: {
        id: 'msg-img-1',
        evolution_message_id: 'evo-img-1',
        content: '[Imagem]',
        content_type: 'image',
        ai_input_text: null,
        processing_status: 'failed',
        processing_error: 'vision_provider_unavailable',
      },
    })

    mocks.refreshMessageHistory.mockResolvedValue([result.message])
    mocks.createAdminClient.mockReturnValue({
      from() {
        return {
          update() {
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          },
        }
      },
    })

    const report = await runConversationBotTurn(result)

    expect(mocks.runAgent).not.toHaveBeenCalled()
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(mocks.dispatch.mock.calls[0][1]).toMatchObject({
      reply: expect.stringContaining('Recebi sua mídia'),
      handoff: {
        needs_human: true,
        reason: 'multimodal_processing_failed',
      },
      debug: {
        notes: 'multimodal_processing_failed',
      },
    })
    expect(report).toMatchObject({
      attempted: true,
      sent: false,
      reason: 'multimodal_processing_failed',
    })
  })

  it('short-circuits to safe handoff when audio transcription failed', async () => {
    const result = buildResult({
      message: {
        id: 'msg-audio-failed',
        evolution_message_id: 'evo-audio-failed',
        content: '[Áudio]',
        content_type: 'audio',
        ai_input_text: null,
        processing_status: 'failed',
        processing_error: 'transcription_processing_failed',
      },
    })

    mocks.refreshMessageHistory.mockResolvedValue([result.message])
    mocks.createAdminClient.mockReturnValue({
      from() {
        return {
          update() {
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          },
        }
      },
    })

    const report = await runConversationBotTurn(result)

    expect(mocks.runAgent).not.toHaveBeenCalled()
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(mocks.dispatch.mock.calls[0][1]).toMatchObject({
      handoff: {
        needs_human: true,
        reason: 'multimodal_processing_failed',
      },
    })
    expect(report).toMatchObject({
      attempted: true,
      sent: false,
      reason: 'multimodal_processing_failed',
    })
  })

  it('marks the triggering message as sent_to_agent_at before calling the LLM when ai_input_text is ready', async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })
    const result = buildResult({
      message: {
        id: 'msg-audio-1',
        evolution_message_id: 'evo-audio-1',
        content: '[Áudio]',
        content_type: 'audio',
        ai_input_text: 'Transcrição do áudio do contato: Quero remarcar a consulta',
        processing_status: 'processed',
        derived_kind: 'transcription',
      },
    })

    mocks.refreshMessageHistory.mockResolvedValue([result.message])
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table !== 'messages') {
          throw new Error(`Unexpected table: ${table}`)
        }
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(field: string, value: string) {
                updateEq(field, value, payload)
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    })
    mocks.runAgent.mockResolvedValue({
      reply: 'Perfeito, vamos verificar.',
      intake_save: null,
      status_next: 'open',
      labels_next: ['etapa_triagem'],
      classification: { intent: 'triagem', stage: 'etapa_triagem', status: 'open' },
      handoff: { needs_human: false, reason: null },
      actions: {
        agenda_check: { should_check: false, time_window_hint: null },
        agenda_create: {
          should_create: false,
          start_iso: null,
          end_iso: null,
          title: null,
          selected_slot_index: null,
        },
        agenda_update: { should_update: false, google_event_id: null },
      },
      debug: { detected_intent: 'triagem', stage_current: 'etapa_triagem', notes: null },
    })
    mocks.dispatch.mockResolvedValue(undefined)

    const report = await runConversationBotTurn(result)

    expect(updateEq).toHaveBeenCalledWith(
      'id',
      'msg-audio-1',
      expect.objectContaining({
        sent_to_agent_at: expect.any(String),
      })
    )
    expect(mocks.runAgent).toHaveBeenCalledTimes(1)
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(report).toMatchObject({
      attempted: true,
      sent: true,
      reason: null,
    })
  })
})
