// SOC — Centro de Operações: agrega alertas conhecidos de todos os clientes ativos/pausados/desconectados.
//
// Cache em memória: resultado válido por CACHE_TTL_MS. Enquanto uma checagem está em andamento,
// requests concorrentes aguardam o mesmo resultado (deduplicação) em vez de abrir novas conexões.

import { NextResponse } from 'next/server'
import { isAuthError, resolveSessionRoleContext } from '@/lib/auth/request-context'
import { createClient } from '@/lib/supabase/server'
import { getConnectionState } from '@/lib/api/evolution'
import type { PanelClientWithRelations } from '@/types/database'

export interface SOCAlert {
  id: string
  client_id: string
  client_name: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  message: string
  action_url: string
}

export interface SOCAlertSummary {
  total: number
  bySeverity: {
    critical: number
    warning: number
    info: number
  }
  byType: Record<string, number>
}

interface CacheEntry {
  alerts: SOCAlert[]
  summary: SOCAlertSummary
  checked_at: string
}

const CACHE_TTL_MS = 25_000       // serve do cache por 25s
const EVOLUTION_TIMEOUT_MS = 3000 // timeout por instância

let cache: CacheEntry | null = null
let cacheExpiresAt = 0
let inflightCheck: Promise<CacheEntry> | null = null

// --- Helpers ---

async function checkWhatsAppState(instanceName: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EVOLUTION_TIMEOUT_MS)
  try {
    const state = await getConnectionState(instanceName)
    return state?.instance?.state ?? state?.state ?? 'close'
  } finally {
    clearTimeout(timer)
  }
}

async function buildAlertsForClient(client: PanelClientWithRelations): Promise<SOCAlert[]> {
  const alerts: SOCAlert[] = []
  const url = `/clients/${client.id}`
  const id = client.id as string
  const supabase = await createClient()

  if (client.status === 'paused') {
    alerts.push({
      id: `${id}:paused`,
      client_id: id,
      client_name: client.name,
      severity: 'info',
      type: 'client_paused',
      message: 'Bot pausado — não responde mensagens enquanto pausado',
      action_url: url,
    })
    return alerts
  }

  if (client.status === 'disconnected') {
    alerts.push({
      id: `${id}:client_disconnected`,
      client_id: id,
      client_name: client.name,
      severity: 'critical',
      type: 'client_disconnected',
      message: 'Cliente marcado como desconectado no painel',
      action_url: url,
    })
    return alerts
  }

  // Cliente ativo — verifica serviços
  const whatsapp = client.panel_whatsapp_config

  if (!whatsapp?.evolution_instance_name) {
    alerts.push({
      id: `${id}:whatsapp_missing`,
      client_id: id,
      client_name: client.name,
      severity: 'critical',
      type: 'whatsapp_missing',
      message: 'WhatsApp não configurado — instância Evolution inexistente',
      action_url: url,
    })
  } else {
    try {
      const state = await checkWhatsAppState(whatsapp.evolution_instance_name)
      if (state === 'close') {
        alerts.push({
          id: `${id}:whatsapp_disconnected`,
          client_id: id,
          client_name: client.name,
          severity: 'critical',
          type: 'whatsapp_disconnected',
          message: 'WhatsApp desconectado — bot não envia mensagens (reconectar QR)',
          action_url: url,
        })
      } else if (state === 'connecting') {
        alerts.push({
          id: `${id}:whatsapp_connecting`,
          client_id: id,
          client_name: client.name,
          severity: 'warning',
          type: 'whatsapp_connecting',
          message: 'WhatsApp aguardando conexão — escaneie o QR code',
          action_url: url,
        })
      }
    } catch {
      alerts.push({
        id: `${id}:whatsapp_unreachable`,
        client_id: id,
        client_name: client.name,
        severity: 'critical',
        type: 'whatsapp_unreachable',
        message: 'Evolution API inacessível — não foi possível verificar WhatsApp',
        action_url: url,
      })
    }
  }

  if (!client.panel_google_config?.google_email) {
    alerts.push({
      id: `${id}:google_missing`,
      client_id: id,
      client_name: client.name,
      severity: 'warning',
      type: 'google_missing',
      message: 'Google Calendar não conectado — agendamentos indisponíveis',
      action_url: url,
    })
  }

  if (!client.panel_bot_config) {
    alerts.push({
      id: `${id}:bot_config_missing`,
      client_id: id,
      client_name: client.name,
      severity: 'warning',
      type: 'bot_config_missing',
      message: 'Bot sem configuração — system prompt vazio',
      action_url: url,
    })
  }

  // Detecta bot potencialmente inativo: recebeu mensagem, mas não respondeu por 6h+
  if (client.status === 'active') {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const { data: staleConversations } = await supabase
      .from('conversations')
      .select('id, last_incoming_at, last_outgoing_at')
      .eq('client_id', client.id)
      .neq('stage', 'resolved')
      .not('last_incoming_at', 'is', null)
      .lt('last_incoming_at', sixHoursAgo)

    const inactiveCount = (staleConversations ?? []).filter((row) => {
      if (!row.last_incoming_at) return false
      if (!row.last_outgoing_at) return true
      return new Date(row.last_outgoing_at).getTime() < new Date(row.last_incoming_at).getTime()
    }).length

    if (inactiveCount > 0) {
      alerts.push({
        id: `${id}:bot_inactive`,
        client_id: id,
        client_name: client.name,
        severity: 'warning',
        type: 'bot_inactive',
        message: `Bot sem resposta recente em ${inactiveCount} conversa(s) (>= 6h)`,
        action_url: url,
      })
    }
  }

  return alerts
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }

function summarizeAlerts(alerts: SOCAlert[]): SOCAlertSummary {
  const summary: SOCAlertSummary = {
    total: alerts.length,
    bySeverity: {
      critical: 0,
      warning: 0,
      info: 0,
    },
    byType: {},
  }

  for (const alert of alerts) {
    summary.bySeverity[alert.severity] += 1
    summary.byType[alert.type] = (summary.byType[alert.type] ?? 0) + 1
  }

  return summary
}

async function checkGlobalConflicts(): Promise<SOCAlert[]> {
  const supabase = await createClient()
  const alerts: SOCAlert[] = []

  // Detecta o mesmo número de WhatsApp conectado em 2+ instâncias
  const { data: configs } = await supabase
    .from('panel_whatsapp_config')
    .select('client_id, evolution_instance_name, connected_phone')
    .not('connected_phone', 'is', null)

  if (configs) {
    const phoneMap = new Map<string, { client_id: string; instance: string }[]>()
    for (const cfg of configs) {
      if (!cfg.connected_phone) continue
      const existing = phoneMap.get(cfg.connected_phone) ?? []
      existing.push({ client_id: cfg.client_id, instance: cfg.evolution_instance_name })
      phoneMap.set(cfg.connected_phone, existing)
    }
    for (const [phone, entries] of phoneMap) {
      if (entries.length > 1) {
        const instanceList = entries.map((e) => e.instance).join(', ')
        alerts.push({
          id: `global:phone_conflict:${phone}`,
          client_id: entries[0].client_id,
          client_name: 'CONFLITO GLOBAL',
          severity: 'critical',
          type: 'phone_number_conflict',
          message: `Número ${phone} conectado em ${entries.length} instâncias simultâneas: ${instanceList}`,
          action_url: '/clients',
        })
      }
    }
  }

  // Detecta clientes em draft que já têm instância vinculada (onboarding incompleto)
  const { data: draftWithInstance } = await supabase
    .from('panel_clients')
    .select('id, name, panel_whatsapp_config(evolution_instance_name)')
    .eq('status', 'draft')
    .not('panel_whatsapp_config', 'is', null)

  if (draftWithInstance) {
    for (const client of (draftWithInstance as unknown) as PanelClientWithRelations[]) {
      if (client.panel_whatsapp_config?.evolution_instance_name) {
        alerts.push({
          id: `${client.id}:draft_with_instance`,
          client_id: client.id as string,
          client_name: client.name,
          severity: 'warning',
          type: 'client_draft_with_instance',
          message: `Cliente em rascunho com instância WhatsApp vinculada — onboarding incompleto`,
          action_url: `/clients/${client.id}`,
        })
      }
    }
  }

  return alerts
}

async function runCheck(): Promise<CacheEntry> {
  const supabase = await createClient()
  const { data: clients, error } = await supabase
    .from('panel_clients')
    .select('*, panel_whatsapp_config(*), panel_google_config(*), panel_bot_config(*)')
    .in('status', ['active', 'paused', 'disconnected'])
    .order('name')

  if (error) throw error

  const [results, globalAlerts] = await Promise.all([
    Promise.allSettled(
      (clients as PanelClientWithRelations[]).map(buildAlertsForClient)
    ),
    checkGlobalConflicts().catch(() => [] as SOCAlert[]),
  ])

  const clientAlerts = results
    .filter((r): r is PromiseFulfilledResult<SOCAlert[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)

  const alerts = [...globalAlerts, ...clientAlerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  )

  return {
    alerts,
    summary: summarizeAlerts(alerts),
    checked_at: new Date().toISOString(),
  }
}

// --- Handler ---

export async function GET() {
  try {
    const context = await resolveSessionRoleContext()
    if (context.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
    }

    // Serve do cache se ainda válido
    if (cache && Date.now() < cacheExpiresAt) {
      return NextResponse.json(cache)
    }

    // Deduplica: se já tem uma checagem em andamento, aguarda a mesma
    if (!inflightCheck) {
      inflightCheck = runCheck().finally(() => {
        inflightCheck = null
      })
    }

    const entry = await inflightCheck
    cache = entry
    cacheExpiresAt = Date.now() + CACHE_TTL_MS

    return NextResponse.json(entry)
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
