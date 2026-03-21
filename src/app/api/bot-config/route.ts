import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { upsertBotConfig } from '@/lib/db/bot-config'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { PanelBotConfigInsert } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()

    if (!body.client_id || !body.professional_name || !body.working_hours) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: client_id, professional_name, working_hours' },
        { status: 400 }
      )
    }

    const config: PanelBotConfigInsert = {
      client_id: body.client_id,

      // Perfil
      professional_name: body.professional_name,
      professional_title: body.professional_title || null,
      professional_register: body.professional_register || null,
      business_name: body.business_name || null,
      business_segment: body.business_segment || null,
      business_address: body.business_address || null,
      business_phone: body.business_phone || null,

      // Serviços
      services: body.services || [],

      // Horários
      working_hours: body.working_hours,
      appointment_duration_default: body.appointment_duration_default ?? 60,
      appointment_buffer_minutes: body.appointment_buffer_minutes ?? 15,
      max_advance_booking_days: body.max_advance_booking_days ?? 60,
      min_advance_booking_hours: body.min_advance_booking_hours ?? 2,
      allow_same_day_booking: body.allow_same_day_booking ?? true,

      // IA
      ai_greeting_message: body.ai_greeting_message || null,
      ai_tone: body.ai_tone || 'professional_friendly',
      ai_language: body.ai_language || 'pt-BR',
      ai_custom_instructions: body.ai_custom_instructions || null,
      ai_fallback_message: body.ai_fallback_message || null,
      ai_handoff_message: body.ai_handoff_message || null,

      // Follow-up
      followup_enabled: body.followup_enabled ?? true,
      followup_confirmation_hours_before: body.followup_confirmation_hours_before ?? 24,
      followup_reminder_hours_before: body.followup_reminder_hours_before ?? 2,
      followup_noshow_enabled: body.followup_noshow_enabled ?? true,
      msg_confirmation: body.msg_confirmation || null,
      msg_reminder: body.msg_reminder || null,
      msg_noshow: body.msg_noshow || null,
      msg_outside_hours: body.msg_outside_hours || null,

      // Handoff
      handoff_on_negative_sentiment: body.handoff_on_negative_sentiment ?? true,
      handoff_on_medical_urgency: body.handoff_on_medical_urgency ?? true,
      handoff_on_unknown_intent: body.handoff_on_unknown_intent ?? false,
      handoff_max_ai_turns: body.handoff_max_ai_turns ?? 20,
      handoff_keywords: body.handoff_keywords || [],

      // Calendar
      calendar_event_title_template: body.calendar_event_title_template || null,
      calendar_event_description_template: body.calendar_event_description_template || null,
      calendar_create_meet_link: body.calendar_create_meet_link ?? false,
      calendar_send_invite_to_patient: body.calendar_send_invite_to_patient ?? false,
      calendar_color_id: body.calendar_color_id || null,

      // Chatwoot
      chatwoot_auto_resolve_hours: body.chatwoot_auto_resolve_hours ?? 24,
      chatwoot_working_hours_enabled: body.chatwoot_working_hours_enabled ?? true,
      chatwoot_assign_to_agent_id: body.chatwoot_assign_to_agent_id || null,
    }

    const savedConfig = await upsertBotConfig(config)

    await insertAuditLog({
      admin_email: user.email!,
      action: 'bot_config_saved',
      client_id: body.client_id,
      details: {
        professional_name: config.professional_name,
        services_count: config.services.length,
        ai_tone: config.ai_tone,
      },
    })

    return NextResponse.json(savedConfig, { status: 200 })
  } catch (error) {
    console.error('Erro ao salvar configuração do bot:', error)
    return NextResponse.json(
      { error: 'Erro interno ao salvar configuração do bot' },
      { status: 500 }
    )
  }
}
