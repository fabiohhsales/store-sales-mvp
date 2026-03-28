import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBotConfigByClientId } from '@/lib/db/bot-config'
import { sanitizeStageLabels } from '@/lib/bot/stage-labels'
import type { PipelineConversation } from '@/types/pipeline'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const clientId = request.nextUrl.searchParams.get('client_id')
    const statusFilter = request.nextUrl.searchParams.get('status')

    const auth = await authenticateRequest(token, clientId)
    const admin = createAdminClient()

    // 1. Busca chatwoot_account_id
    const { data: whatsappConfig, error: whatsappError } = await admin
      .from('panel_whatsapp_config')
      .select('chatwoot_account_id, chatwoot_agent_token')
      .eq('client_id', auth.client_id)
      .single()

    if (whatsappError || !whatsappConfig?.chatwoot_account_id) {
      return NextResponse.json(
        { error: 'Cliente sem configuração WhatsApp/Chatwoot' },
        { status: 404 }
      )
    }

    // 2. Busca stage_labels
    const botConfig = await getBotConfigByClientId(auth.client_id)
    const stageLabels = sanitizeStageLabels(botConfig?.stage_labels)

    // 3. Query conversations
    let query = admin
      .from('conversations')
      .select('*, contacts!inner(name, phone_number, identifier)')
      .eq('account_id', whatsappConfig.chatwoot_account_id)

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data: conversations, error: convError } = await query
      .order('updated_at', { ascending: false })

    if (convError) throw convError

    // 4. Busca appointments mais recentes por conversation
    const conversationIds = (conversations || []).map((c: Record<string, unknown>) => c.id as string)
    let appointmentsMap: Record<string, Record<string, unknown>> = {}

    if (conversationIds.length > 0) {
      const { data: appointments } = await admin
        .from('appointments')
        .select('id, conversation_id, start_at, end_at, status, meet_link')
        .in('conversation_id', conversationIds)
        .order('start_at', { ascending: false })

      if (appointments) {
        for (const apt of appointments) {
          // Mantém só o mais recente por conversation
          if (!appointmentsMap[apt.conversation_id]) {
            appointmentsMap[apt.conversation_id] = apt
          }
        }
      }
    }

    // 5. Mapeia para PipelineConversation
    const stageSlugs = new Set(stageLabels.map((s) => s.slug))

    const pipelineConversations: PipelineConversation[] = (conversations || []).map(
      (conv: Record<string, unknown>) => {
        const contact = conv.contacts as Record<string, unknown> | null
        const labels = (conv.labels as string[]) || []
        const stageSlug = labels.find((l) => stageSlugs.has(l)) || '_sem_etapa'
        const apt = appointmentsMap[conv.id as string] || null

        return {
          id: conv.id as string,
          chatwoot_conversation_id: conv.chatwoot_conversation_id as number,
          contact_name: (contact?.name as string) || null,
          contact_phone: (contact?.phone_number as string) || null,
          contact_identifier: (contact?.identifier as string) || null,
          status: conv.status as 'pending' | 'open' | 'resolved',
          stage_slug: stageSlug,
          labels,
          last_incoming_at: (conv.last_incoming_at as string) || null,
          last_outgoing_at: (conv.last_outgoing_at as string) || null,
          followup_cadence: (conv.followup_cadence as string) || null,
          appointment_status: (conv.appointment_status as string) || null,
          appointment: apt
            ? {
                id: apt.id as string,
                start_at: apt.start_at as string,
                end_at: apt.end_at as string,
                status: (apt.status as string) || null,
                meet_link: (apt.meet_link as string) || null,
              }
            : null,
        }
      }
    )

    // Adiciona coluna "Sem etapa" se houver conversations sem stage
    const hasUnstaged = pipelineConversations.some((c) => c.stage_slug === '_sem_etapa')
    const columns = hasUnstaged
      ? [{ slug: '_sem_etapa', display_name: 'Sem etapa' }, ...stageLabels]
      : stageLabels

    return NextResponse.json({ columns, conversations: pipelineConversations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
