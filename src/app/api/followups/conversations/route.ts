
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSuppressedConversations, resolveLeadSteps, resolveAtendimentoSteps, resolveAgendadoSteps } from '@/lib/followup/shared';
import { sanitizeStageLabels } from '@/lib/bot/stage-labels';
import type { FollowupConversationsResponse, FollowupConversation, CadenceType } from '@/types/followup';
import type { PanelBotConfig } from '@/types/database';

/**
 * GET /api/followups/conversations
 * Query params: client_id, cadence, step, status, page, per_page
 * Returns: { summary, tree, conversations, pagination }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  const cadence = searchParams.get('cadence') as CadenceType | null;
  const step = searchParams.get('step');
  const status = (searchParams.get('status') || 'all') as 'all' | 'waiting_response' | 'responded';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const perPage = Math.max(1, Math.min(100, parseInt(searchParams.get('per_page') || '20', 10)));

  if (!clientId) {
    return NextResponse.json({ error: 'Missing client_id' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch bot config for step tree
  const { data: botConfigRaw, error: botConfigError } = await admin
    .from('panel_bot_config')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (botConfigError) {
    return NextResponse.json({ error: 'Erro ao buscar bot config' }, { status: 500 });
  }
  const botConfig = botConfigRaw as PanelBotConfig | null;

  // Build tree (cadence > step)
  const tree = [
    { cadence: 'lead', steps: resolveLeadSteps(botConfig ?? ({} as PanelBotConfig)).map(s => ({ step_key: s.step_key, label: s.label })) },
    { cadence: 'atendimento', steps: resolveAtendimentoSteps(botConfig ?? ({} as PanelBotConfig)).map(s => ({ step_key: s.step_key, label: s.label })) },
    { cadence: 'agendado', steps: resolveAgendadoSteps(botConfig ?? ({} as PanelBotConfig)).map(s => ({ step_key: s.step_key, label: s.label })) },
  ];

  // Fetch conversations for client
  let query = admin
    .from('conversations')
    .select(`id, contact_id, followup_cadence, current_followup_step, current_followup_step_label, last_incoming_at, last_outgoing_at, status, stage, contacts(name, phone_number)`) // contacts is a join
    .eq('client_id', clientId)
    .neq('status', 'resolved')
    .order('last_outgoing_at', { ascending: false })
    .limit(500);

  if (cadence) query = query.eq('followup_cadence', cadence);
  if (step) query = query.eq('current_followup_step', step);

  const { data: conversationsRaw, error: convError } = await query;
  if (convError) {
    return NextResponse.json({ error: 'Erro ao buscar conversas' }, { status: 500 });
  }
  let conversations = (conversationsRaw ?? []).map((c: any) => ({
    conversation_id: c.id,
    contact_name: c.contacts?.[0]?.name ?? 'Sem nome',
    contact_phone: c.contacts?.[0]?.phone_number ?? '',
    cadence_type: c.followup_cadence,
    current_step: c.current_followup_step,
    current_step_label: c.current_followup_step_label,
    step_sent_at: c.last_outgoing_at,
    total_attempts: 0, // will fill below
    waiting_response: c.last_outgoing_at && (!c.last_incoming_at || new Date(c.last_outgoing_at) > new Date(c.last_incoming_at)),
    last_incoming_at: c.last_incoming_at,
    last_outgoing_at: c.last_outgoing_at,
    last_message_preview: '', // can be filled with last message if needed
    stage: c.stage,
  })) as FollowupConversation[];

  // Suppression filtering
  const [suppressedLead, suppressedAtendimento, suppressedAgendado] = await Promise.all([
    getSuppressedConversations(clientId, 'lead'),
    getSuppressedConversations(clientId, 'atendimento'),
    getSuppressedConversations(clientId, 'agendado'),
  ]);
  conversations = conversations.filter((c) => {
    if (c.cadence_type === 'lead' && suppressedLead.has(c.conversation_id)) return false;
    if (c.cadence_type === 'atendimento' && suppressedAtendimento.has(c.conversation_id)) return false;
    if (c.cadence_type === 'agendado' && suppressedAgendado.has(c.conversation_id)) return false;
    return true;
  });

  // Status filtering
  if (status === 'waiting_response') {
    conversations = conversations.filter((c) => c.waiting_response);
  } else if (status === 'responded') {
    conversations = conversations.filter((c) => !c.waiting_response);
  }

  // Pagination
  const total = conversations.length;
  const paginated = conversations.slice((page - 1) * perPage, page * perPage);

  // Summary (basic)
  const summary = {
    total,
    waitingResponse: conversations.filter((c) => c.waiting_response).length,
    responded: conversations.filter((c) => !c.waiting_response).length,
  };

  const response: FollowupConversationsResponse = {
    summary,
    tree,
    conversations: paginated,
    pagination: { page, perPage, total },
  };
  return NextResponse.json(response);
}
