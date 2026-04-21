import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '@/lib/bot/system-prompt'

describe('buildSystemPrompt', () => {
  it('includes upcoming appointment context, patient context, and the slot-index schema', () => {
    const prompt = buildSystemPrompt(
      {
        professional_name: 'Dra. Fernanda Souza',
        professional_title: 'Dermatologista',
        business_name: 'Clinica Exemplo',
        ai_tone: 'professional_friendly',
        working_hours: {
          sunday: { enabled: false, start: '09:00', end: '18:00' },
          monday: { enabled: true, start: '09:00', end: '18:00' },
          tuesday: { enabled: true, start: '09:00', end: '18:00' },
          wednesday: { enabled: true, start: '09:00', end: '18:00' },
          thursday: { enabled: true, start: '09:00', end: '18:00' },
          friday: { enabled: true, start: '09:00', end: '18:00' },
          saturday: { enabled: false, start: '09:00', end: '18:00' },
        },
        services: [],
        handoff_keywords: [],
        max_advance_booking_days: 60,
        min_advance_booking_hours: 2,
        appointment_duration_default: 60,
        allow_same_day_booking: false,
        ai_language: 'pt-BR',
        stage_labels: [],
        intake_enabled: false,
        intake_fields: [],
        intake_request_photos: false,
        intake_photos_count: 0,
        ai_custom_instructions: null,
        process_flow_guide: null,
        objections_guide: null,
        qualification_questions_guide: null,
        disengagement_policy_guide: null,
        handoff_on_negative_sentiment: false,
        handoff_on_medical_urgency: false,
        handoff_on_unknown_intent: false,
        ai_handoff_message: null,
        handoff_max_ai_turns: null,
        ai_greeting_message: null,
        ai_fallback_message: null,
        msg_outside_hours: null,
        timezone: 'America/Sao_Paulo',
      } as any,
      'Maria Silva',
      {
        status: 'pending',
        labelsCurrent: ['etapa_triagem'],
        stageCurrent: 'etapa_triagem',
        followupCadenceCurrent: 'none',
        appointmentStatus: 'scheduled',
        lastIncomingAt: '2026-04-20T12:00:00Z',
        lastOutgoingAt: '2026-04-20T12:01:00Z',
        upcomingAppointment: {
          id: 'appt-123',
          start_at: '2026-04-22T12:00:00Z',
          end_at: '2026-04-22T13:00:00Z',
          status: 'scheduled',
          title: 'Consulta de retorno',
        },
        patientContext: 'has_future_appointment',
      },
      {
        custom_data: { email: 'maria@example.com' },
        intake_completed_at: null,
      }
    )

    expect(prompt).toContain('- upcoming_appointment:')
    expect(prompt).toContain('PATIENT CONTEXT:')
    expect(prompt).toContain('selected_slot_index')
    expect(prompt).toContain('google_event_id = null')
  })
})
