/**
 * Follow-up State & Events Tests
 * Fase 1: Testes unitários para helpers de estado e eventos
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { ConversationFollowupState, FollowupState } from '@/lib/followup/state'
import type { FollowupEvent, FollowupEventType } from '@/lib/followup/events'
import { buildDisplayText } from '@/lib/followup/events'

// Mock do Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      execute: vi.fn().mockResolvedValue({ data: [], error: null })
    }))
  }))
}))

describe('Follow-up State Management', () => {
  const mockClientId = '00000000-0000-0000-0000-000000000001'
  const mockConversationId = '00000000-0000-0000-0000-000000000002'
  const mockContactId = '00000000-0000-0000-0000-000000000003'

  it('should have valid state types', () => {
    const validStates: FollowupState[] = [
      'none',
      'eligible',
      'scheduled',
      'active',
      'paused_by_human',
      'blocked',
      'recommended_manual',
      'completed',
      'cancelled',
      'failed'
    ]

    expect(validStates).toHaveLength(10)
    expect(validStates).toContain('active')
    expect(validStates).toContain('scheduled')
  })

  it('should have all required fields in ConversationFollowupState type', () => {
    const mockState: ConversationFollowupState = {
      id: '00000000-0000-0000-0000-000000000004',
      client_id: mockClientId,
      conversation_id: mockConversationId,
      contact_id: mockContactId,
      state: 'active',
      cadence_type: 'lead',
      current_step_key: 'd1',
      current_step_label: 'Lead D1',
      total_attempts: 1,
      reason_code: null,
      reason_label: null,
      next_action: null,
      next_scheduled_for: null,
      last_evaluated_at: new Date().toISOString(),
      last_event_at: null,
      last_sent_at: new Date().toISOString(),
      last_error_at: null,
      last_error_message: null,
      requires_human_approval: false,
      ai_confidence: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    expect(mockState).toBeDefined()
    expect(mockState.state).toBe('active')
    expect(mockState.cadence_type).toBe('lead')
  })
})

describe('Follow-up Events Management', () => {
  const mockClientId = '00000000-0000-0000-0000-000000000001'
  const mockConversationId = '00000000-0000-0000-0000-000000000002'
  const mockContactId = '00000000-0000-0000-0000-000000000003'

  it('should have valid event types', () => {
    const validEventTypes: FollowupEventType[] = [
      'followup_evaluated',
      'followup_scheduled',
      'followup_sent',
      'followup_skipped',
      'followup_blocked',
      'followup_paused',
      'followup_resumed',
      'followup_cancelled',
      'followup_completed',
      'followup_failed',
      'bot_retake_evaluated',
      'bot_retake_suggested',
      'bot_retake_scheduled',
      'bot_retake_executed',
      'tag_added',
      'tag_removed',
      'state_changed'
    ]

    expect(validEventTypes).toHaveLength(17)
    expect(validEventTypes).toContain('followup_sent')
    expect(validEventTypes).toContain('followup_skipped')
  })

  it('should have all required fields in FollowupEvent type', () => {
    const mockEvent: FollowupEvent = {
      id: '00000000-0000-0000-0000-000000000005',
      client_id: mockClientId,
      conversation_id: mockConversationId,
      contact_id: mockContactId,
      event_type: 'followup_sent',
      cadence_type: 'lead',
      step_key: 'd1',
      previous_state: null,
      new_state: null,
      reason_code: null,
      reason_label: null,
      display_text: 'Follow-up enviado (Lead - d1)',
      scheduled_for: null,
      sent_at: new Date().toISOString(),
      actor_type: 'system',
      actor_id: null,
      confidence: null,
      requires_human_approval: false,
      metadata: {},
      created_at: new Date().toISOString()
    }

    expect(mockEvent).toBeDefined()
    expect(mockEvent.event_type).toBe('followup_sent')
    expect(mockEvent.actor_type).toBe('system')
  })
})

describe('buildDisplayText', () => {
  it('should format followup_scheduled correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_scheduled',
      scheduled_for: '2026-05-08T10:00:00Z',
      reason_label: 'Lead não respondeu'
    })

    expect(text).toContain('Follow-up programado para')
    expect(text).toContain('Lead não respondeu')
  })

  it('should format followup_sent correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'lead',
      step_key: 'd1'
    })

    expect(text).toContain('Follow-up enviado')
    expect(text).toContain('Lead')
    expect(text).toContain('d1')
  })

  it('should format followup_skipped correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_skipped',
      reason_label: 'Conversa em atendimento humano'
    })

    expect(text).toContain('Follow-up pulado')
    expect(text).toContain('Conversa em atendimento humano')
  })

  it('should format followup_blocked correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_blocked',
      reason_label: 'WhatsApp desconectado'
    })

    expect(text).toContain('Follow-up bloqueado')
    expect(text).toContain('WhatsApp desconectado')
  })

  it('should format state_changed correctly', () => {
    const text = buildDisplayText({
      event_type: 'state_changed',
      previous_state: 'scheduled',
      new_state: 'active'
    })

    expect(text).toContain('Estado mudou')
    expect(text).toContain('scheduled')
    expect(text).toContain('active')
  })

  it('should format bot_retake_suggested correctly', () => {
    const text = buildDisplayText({
      event_type: 'bot_retake_suggested',
      reason_label: 'Conversa parada há 5 dias'
    })

    expect(text).toContain('Retomada sugerida')
    expect(text).toContain('Conversa parada há 5 dias')
  })

  it('should handle unknown event types', () => {
    const text = buildDisplayText({
      event_type: 'tag_added' as FollowupEventType
    })

    expect(text).toContain('Evento:')
    expect(text).toContain('tag_added')
  })

  it('should handle missing optional fields gracefully', () => {
    const text = buildDisplayText({
      event_type: 'followup_scheduled',
      scheduled_for: null,
      reason_label: null
    })

    expect(text).toContain('Follow-up programado')
    expect(text).toContain('data não definida')
  })
})

describe('Integration scenarios', () => {
  const mockClientId = '00000000-0000-0000-0000-000000000001'
  const mockConversationId = '00000000-0000-0000-0000-000000000002'

  it('should represent a full lead cadence flow', () => {
    // Step 1: Evaluated
    const evaluatedText = buildDisplayText({
      event_type: 'followup_evaluated',
      reason_label: 'Lead elegível para D1'
    })
    expect(evaluatedText).toContain('avaliou follow-up')

    // Step 2: Scheduled
    const scheduledText = buildDisplayText({
      event_type: 'followup_scheduled',
      scheduled_for: '2026-05-08T10:00:00Z'
    })
    expect(scheduledText).toContain('programado')

    // Step 3: Sent
    const sentText = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'lead',
      step_key: 'd1'
    })
    expect(sentText).toContain('enviado')

    // Step 4: State changed
    const stateChangedText = buildDisplayText({
      event_type: 'state_changed',
      previous_state: 'scheduled',
      new_state: 'active'
    })
    expect(stateChangedText).toContain('Estado mudou')
  })

  it('should represent a skip scenario', () => {
    const skippedText = buildDisplayText({
      event_type: 'followup_skipped',
      reason_label: 'Fora do horário de trabalho'
    })
    expect(skippedText).toContain('pulado')
    expect(skippedText).toContain('Fora do horário')
  })

  it('should represent a blocked scenario', () => {
    const blockedText = buildDisplayText({
      event_type: 'followup_blocked',
      reason_label: 'WhatsApp desconectado'
    })
    expect(blockedText).toContain('bloqueado')
    expect(blockedText).toContain('WhatsApp desconectado')
  })

  it('should represent an agendado cadence', () => {
    const agendadoText = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'agendado',
      step_key: 'confirmation_d2'
    })
    expect(agendadoText).toContain('Agendado')
    expect(agendadoText).toContain('confirmation_d2')
  })

  it('should represent a human retake scenario', () => {
    const retakeText = buildDisplayText({
      event_type: 'bot_retake_executed',
      reason_label: 'Conversa retomada após 7 dias de inatividade'
    })
    expect(retakeText).toContain('retomou a conversa')
    expect(retakeText).toContain('7 dias')
  })
})

describe('Edge cases and error handling', () => {
  it('should handle malformed dates gracefully', () => {
    const text = buildDisplayText({
      event_type: 'followup_scheduled',
      scheduled_for: 'invalid-date'
    })
    expect(text).toContain('data inválida')
  })

  it('should handle null dates', () => {
    const text = buildDisplayText({
      event_type: 'followup_scheduled',
      scheduled_for: null
    })
    expect(text).toContain('data não definida')
  })

  it('should handle empty reason_label', () => {
    const text = buildDisplayText({
      event_type: 'followup_skipped',
      reason_label: ''
    })
    expect(text).toBe('Follow-up pulado')
  })

  it('should handle undefined cadence_type', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: undefined,
      step_key: 'd1'
    })
    expect(text).toContain('Desconhecido')
  })

  it('should handle undefined step_key', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'lead',
      step_key: undefined
    })
    expect(text).toContain('Step desconhecido')
  })
})

describe('Cadence type labels', () => {
  it('should format lead cadence correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'lead',
      step_key: 'd1'
    })
    expect(text).toContain('Lead')
  })

  it('should format atendimento cadence correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'atendimento',
      step_key: 'd2'
    })
    expect(text).toContain('Atendimento')
  })

  it('should format agendado cadence correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'agendado',
      step_key: 'confirmation'
    })
    expect(text).toContain('Agendado')
  })

  it('should format human_retake cadence correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_sent',
      cadence_type: 'human_retake',
      step_key: 'retake_d5'
    })
    expect(text).toContain('Retomada')
  })
})
