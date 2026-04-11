import { createClient } from '@/lib/supabase/server'
import { getBotConfigByClientId, updateBotConfig, upsertBotConfig } from '@/lib/db/bot-config'
import { getWhatsAppConfigByClientId } from '@/lib/db/whatsapp-config'
import { insertAuditLog } from '@/lib/db/audit-log'
import { ensureChatwootLabels, listChatwootStageLabels } from '@/lib/api/chatwoot'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'
import type { PanelBotConfigInsert } from '@/types/database'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    const user = session?.user

    if (authError || !user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const clientId = new URL(request.url).searchParams.get('client_id')
    if (!clientId) {
      return Response.json({ error: 'Parâmetro obrigatório: client_id' }, { status: 400 })
    }

    const config = await getBotConfigByClientId(clientId)
    if (!config) {
      return Response.json({ error: 'Configuração não encontrada' }, { status: 404 })
    }

    const whatsappConfig = await getWhatsAppConfigByClientId(clientId)
    if (!whatsappConfig?.chatwoot_account_id || !whatsappConfig.chatwoot_agent_token) {
      return Response.json(config, { status: 200 })
    }

    try {
      const remoteLabels = await listChatwootStageLabels(
        whatsappConfig.chatwoot_account_id,
        whatsappConfig.chatwoot_agent_token
      )

      if (remoteLabels.length > 0) {
        const currentBySlug = new Map(
          sanitizeStageLabels(config.stage_labels).map((item) => [item.slug, item.followup_cadence ?? null])
        )

        const stageLabels = sanitizeStageLabels(remoteLabels).map((item) => ({
          ...item,
          followup_cadence: currentBySlug.get(item.slug) ?? null,
        }))
        const normalizedCurrent = JSON.stringify(sanitizeStageLabels(config.stage_labels))
        const normalizedRemote = JSON.stringify(stageLabels)

        if (normalizedCurrent !== normalizedRemote) {
          const updated = await updateBotConfig(clientId, { stage_labels: stageLabels })
          return Response.json(updated, { status: 200 })
        }
      }
    } catch (syncError) {
      console.warn('[BotConfig] Pull de etiquetas Chatwoot falhou, retornando dados locais:', syncError)
    }

    return Response.json(config, { status: 200 })
  } catch (error) {
    console.error('Erro ao buscar configuração do bot:', error)
    return Response.json(
      { error: 'Erro interno ao buscar configuração do bot' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    const user = session?.user

    if (authError || !user) {
      return Response.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const stageLabels = sanitizeStageLabels(body.stage_labels)

    if (!body.client_id || !body.professional_name || !body.working_hours) {
      return Response.json(
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
      stage_labels: stageLabels,

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
      process_flow_guide: body.process_flow_guide || null,
      objections_guide: body.objections_guide || null,
      qualification_questions_guide: body.qualification_questions_guide || null,
      disengagement_policy_guide: body.disengagement_policy_guide || null,
      ai_fallback_message: body.ai_fallback_message || null,
      ai_handoff_message: body.ai_handoff_message || null,

      // Intake
      intake_enabled: body.intake_enabled ?? false,
      intake_fields: body.intake_fields || [],
      intake_request_photos: body.intake_request_photos ?? false,
      intake_photos_count: body.intake_photos_count ?? 5,
      intake_handoff_after_photos: body.intake_handoff_after_photos ?? true,
      intake_photo_guide_url: body.intake_photo_guide_url || null,

      // Timezone
      timezone: body.timezone || 'America/Sao_Paulo',

      // Follow-up
      followup_enabled: body.followup_enabled ?? true,
      followup_confirmation_hours_before: body.followup_confirmation_hours_before ?? 24,
      followup_reminder_hours_before: body.followup_reminder_hours_before ?? 2,
      followup_noshow_enabled: body.followup_noshow_enabled ?? true,
      msg_confirmation: body.msg_confirmation || null,
      msg_reminder: body.msg_reminder || null,
      msg_noshow: body.msg_noshow || null,
      msg_outside_hours: body.msg_outside_hours || null,
      lead_followup_enabled: body.lead_followup_enabled ?? false,
      lead_followup_msg_d1: body.lead_followup_msg_d1 || null,
      lead_followup_msg_d2: body.lead_followup_msg_d2 || null,
      lead_followup_msg_d3: body.lead_followup_msg_d3 || null,
      lead_followup_msg_d5: body.lead_followup_msg_d5 || null,
      lead_followup_msg_d7: body.lead_followup_msg_d7 || null,
      atendimento_followup_enabled: body.atendimento_followup_enabled ?? false,
      atendimento_followup_msg_d1: body.atendimento_followup_msg_d1 || null,
      atendimento_followup_msg_d2: body.atendimento_followup_msg_d2 || null,
      atendimento_followup_msg_d4: body.atendimento_followup_msg_d4 || null,
      atendimento_followup_msg_d7: body.atendimento_followup_msg_d7 || null,
      atendimento_followup_msg_d10: body.atendimento_followup_msg_d10 || null,
      agendado_followup_msg_d2: body.agendado_followup_msg_d2 || null,
      agendado_followup_msg_minus3h: body.agendado_followup_msg_minus3h || null,
      agendado_followup_msg_minus5min: body.agendado_followup_msg_minus5min || null,

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

      // Agenda
      agenda_recipient_email: body.agenda_recipient_email || null,

      // Chatwoot
      chatwoot_auto_resolve_hours: body.chatwoot_auto_resolve_hours ?? 24,
      chatwoot_working_hours_enabled: body.chatwoot_working_hours_enabled ?? true,
      chatwoot_assign_to_agent_id: body.chatwoot_assign_to_agent_id || null,
    }

    const savedConfig = await upsertBotConfig(config)

    // Sincroniza labels no Chatwoot quando o cliente já tem account/token.
    // Falha de sync não bloqueia o salvamento do bot config.
    try {
      const whatsappConfig = await getWhatsAppConfigByClientId(body.client_id)
      if (whatsappConfig?.chatwoot_account_id && whatsappConfig.chatwoot_agent_token) {
        await ensureChatwootLabels(
          whatsappConfig.chatwoot_account_id,
          whatsappConfig.chatwoot_agent_token,
          config.stage_labels
        )
      }
    } catch (syncError) {
      console.warn('[BotConfig] Falha ao sincronizar etiquetas no Chatwoot:', syncError)
    }

    await insertAuditLog({
      admin_email: user.email!,
      action: 'bot_config_saved',
      client_id: body.client_id,
      details: {
        professional_name: config.professional_name,
        services_count: config.services.length,
        ai_tone: config.ai_tone,
        stage_labels_count: config.stage_labels.length,
      },
    })

    return Response.json(savedConfig, { status: 200 })
  } catch (error) {
    console.error('Erro ao salvar configuração do bot:', error)
    return Response.json(
      { error: 'Erro interno ao salvar configuração do bot' },
      { status: 500 }
    )
  }
}
