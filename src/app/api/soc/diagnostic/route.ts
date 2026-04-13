// GET /api/soc/diagnostic
//
// Relatório detalhado de saúde por cliente. Diferente do /api/soc (que retorna alertas
// condensados), este endpoint retorna um checklist completo por cliente com ações
// de recuperação sugeridas e detalhes de cada problema.
//
// Restrito a admins. Sem cache — cada chamada faz checagem completa.

import { NextResponse } from 'next/server'
import { isAuthError, resolveSessionRoleContext } from '@/lib/auth/request-context'
import { createClient } from '@/lib/supabase/server'
import { getConnectionState } from '@/lib/api/evolution'
import type { PanelClientWithRelations } from '@/types/database'

export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'warning' | 'critical' | 'unknown'

interface DiagnosticCheck {
  name: string
  status: CheckStatus
  detail: string
  recovery?: string
}

interface ClientDiagnostic {
  client_id: string
  client_name: string
  client_status: string
  overall: CheckStatus
  checks: DiagnosticCheck[]
}

interface GlobalDiagnostic {
  phone_conflicts: Array<{
    phone: string
    instances: Array<{ instance: string; client_id: string }>
  }>
  draft_with_instance: Array<{ client_id: string; client_name: string; instance: string }>
  stuck_conversations: Array<{
    conversation_id: string
    client_id: string
    stage: string
    hours_stuck: number
  }>
  expired_ai_pauses: number
}

interface DiagnosticReport {
  overall_status: CheckStatus
  checked_at: string
  duration_ms: number
  summary: {
    overall_status: CheckStatus
    clients: {
      total: number
      ok: number
      warning: number
      critical: number
      unknown: number
    }
    global: {
      phone_conflicts: number
      draft_with_instance: number
      stuck_conversations: number
      expired_ai_pauses: number
    }
  }
  global: GlobalDiagnostic
  clients: ClientDiagnostic[]
}

const EVOLUTION_TIMEOUT_MS = 4000
const STUCK_CONVERSATION_HOURS = 4

function worstStatus(checks: DiagnosticCheck[]): CheckStatus {
  if (checks.some((c) => c.status === 'critical')) return 'critical'
  if (checks.some((c) => c.status === 'warning')) return 'warning'
  if (checks.some((c) => c.status === 'unknown')) return 'unknown'
  return 'ok'
}

async function diagnoseClient(client: PanelClientWithRelations): Promise<ClientDiagnostic> {
  const checks: DiagnosticCheck[] = []
  const supabase = await createClient()

  // 1. Status do cliente
  const statusOk = client.status === 'active'
  const statusWarning = client.status === 'paused'
  checks.push({
    name: 'client_status',
    status: statusOk ? 'ok' : statusWarning ? 'warning' : 'critical',
    detail: `Status: ${client.status}`,
    recovery: statusOk || statusWarning
      ? undefined
      : `Verificar onboarding em /clients/${client.id}`,
  })

  // 2. WhatsApp — instância configurada
  const whatsapp = client.panel_whatsapp_config
  if (!whatsapp?.evolution_instance_name) {
    checks.push({
      name: 'whatsapp_instance',
      status: 'critical',
      detail: 'Instância Evolution não configurada',
      recovery: `Provisionar WhatsApp em /clients/${client.id}`,
    })
  } else {
    checks.push({
      name: 'whatsapp_instance',
      status: 'ok',
      detail: `Instância: ${whatsapp.evolution_instance_name}`,
    })

    // 3. WhatsApp — status de conexão
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), EVOLUTION_TIMEOUT_MS)
      const state = await getConnectionState(whatsapp.evolution_instance_name)
      const rawState = state?.instance?.state ?? state?.state ?? 'close'
      const connStatus: CheckStatus =
        rawState === 'open' ? 'ok' : rawState === 'connecting' ? 'warning' : 'critical'
      checks.push({
        name: 'whatsapp_connection',
        status: connStatus,
        detail: `Estado Evolution: ${rawState}`,
        recovery:
          connStatus !== 'ok'
            ? `Reconectar WhatsApp em /connect/${whatsapp.evolution_instance_name}`
            : undefined,
      })
    } catch {
      checks.push({
        name: 'whatsapp_connection',
        status: 'unknown',
        detail: 'Evolution API inacessível (timeout ou erro de rede)',
        recovery: 'Verificar se Evolution API está online',
      })
    }

    // 4. Webhook configurado
    const webhookOk =
      whatsapp.webhook_url?.includes('/api/webhooks/evolution') ?? false
    checks.push({
      name: 'whatsapp_webhook',
      status: webhookOk ? 'ok' : 'critical',
      detail: webhookOk
        ? `Webhook: ${whatsapp.webhook_url}`
        : `Webhook incorreto ou ausente: ${whatsapp.webhook_url ?? 'null'}`,
      recovery: webhookOk
        ? undefined
        : 'Reconfigurar webhook via Evolution API POST /webhook/set/{instance}',
    })

    // 5. Número conectado salvo no banco
    const phoneOk = !!whatsapp.connected_phone
    checks.push({
      name: 'whatsapp_phone',
      status: phoneOk ? 'ok' : 'warning',
      detail: phoneOk
        ? `Número: ${whatsapp.connected_phone}`
        : 'connected_phone não preenchido no banco',
      recovery: phoneOk
        ? undefined
        : 'Reconectar WhatsApp para atualizar o número no banco',
    })
  }

  // 6. Google Calendar
  const googleOk = !!client.panel_google_config?.google_email
  checks.push({
    name: 'google_calendar',
    status: googleOk ? 'ok' : 'warning',
    detail: googleOk
      ? `Google: ${client.panel_google_config!.google_email}`
      : 'Google Calendar não conectado',
    recovery: googleOk ? undefined : `Conectar Google em /clients/${client.id}`,
  })

  // 7. Bot config
  const botOk = !!client.panel_bot_config?.professional_name
  checks.push({
    name: 'bot_config',
    status: botOk ? 'ok' : 'critical',
    detail: botOk
      ? `Bot configurado para: ${client.panel_bot_config!.professional_name}`
      : 'panel_bot_config inexistente ou sem professional_name',
    recovery: botOk ? undefined : `Configurar bot em /clients/${client.id}`,
  })

  // 8. Conversas abertas sem resposta recente (bot inativo > 6h)
  if (client.status === 'active') {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const { data: stale } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', client.id)
      .neq('stage', 'resolved')
      .not('last_incoming_at', 'is', null)
      .lt('last_incoming_at', sixHoursAgo)

    const staleCount = (stale ?? []).filter(() => true).length
    checks.push({
      name: 'bot_responsiveness',
      status: staleCount === 0 ? 'ok' : 'warning',
      detail:
        staleCount === 0
          ? 'Nenhuma conversa parada sem resposta'
          : `${staleCount} conversa(s) sem resposta do bot há mais de 6h`,
      recovery:
        staleCount > 0 ? `Verificar conversas no Desk /desk?client_id=${client.id}` : undefined,
    })
  }

  return {
    client_id: client.id as string,
    client_name: client.name,
    client_status: client.status,
    overall: worstStatus(checks),
    checks,
  }
}

async function buildGlobalDiagnostic(): Promise<GlobalDiagnostic> {
  const supabase = await createClient()

  // Conflitos de número
  const { data: configs } = await supabase
    .from('panel_whatsapp_config')
    .select('client_id, evolution_instance_name, connected_phone')
    .not('connected_phone', 'is', null)

  const phoneConflicts: GlobalDiagnostic['phone_conflicts'] = []
  if (configs) {
    const phoneMap = new Map<string, Array<{ instance: string; client_id: string }>>()
    for (const cfg of configs) {
      if (!cfg.connected_phone) continue
      const list = phoneMap.get(cfg.connected_phone) ?? []
      list.push({ instance: cfg.evolution_instance_name, client_id: cfg.client_id })
      phoneMap.set(cfg.connected_phone, list)
    }
    for (const [phone, entries] of phoneMap) {
      if (entries.length > 1) phoneConflicts.push({ phone, instances: entries })
    }
  }

  // Clientes draft com instância
  const { data: drafts } = await supabase
    .from('panel_clients')
    .select('id, name, panel_whatsapp_config(evolution_instance_name)')
    .eq('status', 'draft')

  type DraftRow = {
    id: string
    name: string
    panel_whatsapp_config: { evolution_instance_name: string | null } | null
  }
  const draftWithInstance = ((drafts as DraftRow[] | null) ?? [])
    .map((c) => ({
      client_id: c.id,
      client_name: c.name,
      instance: c.panel_whatsapp_config?.evolution_instance_name ?? null,
    }))
    .filter((c): c is { client_id: string; client_name: string; instance: string } => c.instance !== null)

  // Conversas travadas em awaiting_human > STUCK_CONVERSATION_HOURS horas
  const cutoff = new Date(Date.now() - STUCK_CONVERSATION_HOURS * 60 * 60 * 1000).toISOString()
  const { data: stuck } = await supabase
    .from('conversations')
    .select('id, client_id, stage, last_incoming_at')
    .eq('stage', 'awaiting_human')
    .lt('last_incoming_at', cutoff)

  const stuckConversations = (stuck ?? []).map((row) => {
    const since = row.last_incoming_at ?? new Date().toISOString()
    const hoursStuck = Math.floor((Date.now() - new Date(since).getTime()) / 3_600_000)
    return {
      conversation_id: row.id,
      client_id: row.client_id,
      stage: row.stage,
      hours_stuck: hoursStuck,
    }
  })

  // ai_pauses expiradas que não foram limpas
  const { count: expiredPauses } = await supabase
    .from('ai_pauses')
    .select('conversation_id', { count: 'exact', head: true })
    .lt('paused_until', new Date().toISOString())

  return {
    phone_conflicts: phoneConflicts,
    draft_with_instance: draftWithInstance,
    stuck_conversations: stuckConversations,
    expired_ai_pauses: expiredPauses ?? 0,
  }
}

export async function GET() {
  try {
    const context = await resolveSessionRoleContext()
    if (context.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
    }

    const start = Date.now()
    const supabase = await createClient()

    const { data: clients, error } = await supabase
      .from('panel_clients')
      .select('*, panel_whatsapp_config(*), panel_google_config(*), panel_bot_config(*)')
      .not('status', 'eq', 'draft')
      .order('name')

    if (error) throw error

    const [clientDiagnostics, global] = await Promise.all([
      Promise.all((clients as PanelClientWithRelations[]).map(diagnoseClient)),
      buildGlobalDiagnostic(),
    ])

    const overallStatus: CheckStatus =
      global.phone_conflicts.length > 0 || clientDiagnostics.some((c) => c.overall === 'critical')
        ? 'critical'
        : clientDiagnostics.some((c) => c.overall === 'warning') ||
            global.draft_with_instance.length > 0 ||
            global.stuck_conversations.length > 0
          ? 'warning'
          : 'ok'

    const report: DiagnosticReport = {
      overall_status: overallStatus,
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      summary: {
        overall_status: overallStatus,
        clients: {
          total: clientDiagnostics.length,
          ok: clientDiagnostics.filter((client) => client.overall === 'ok').length,
          warning: clientDiagnostics.filter((client) => client.overall === 'warning').length,
          critical: clientDiagnostics.filter((client) => client.overall === 'critical').length,
          unknown: clientDiagnostics.filter((client) => client.overall === 'unknown').length,
        },
        global: {
          phone_conflicts: global.phone_conflicts.length,
          draft_with_instance: global.draft_with_instance.length,
          stuck_conversations: global.stuck_conversations.length,
          expired_ai_pauses: global.expired_ai_pauses,
        },
      },
      global,
      clients: clientDiagnostics,
    }

    return NextResponse.json(report)
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
