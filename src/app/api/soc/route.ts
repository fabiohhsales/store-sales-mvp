// SOC — Centro de Operações: agrega alertas conhecidos de todos os clientes ativos/pausados/desconectados.
//
// Cache em memória: resultado válido por CACHE_TTL_MS. Enquanto uma checagem está em andamento,
// requests concorrentes aguardam o mesmo resultado (deduplicação) em vez de abrir novas conexões.

import { NextResponse } from 'next/server'
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

interface CacheEntry {
  alerts: SOCAlert[]
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
    return state.instance?.state ?? 'close'
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

async function runCheck(): Promise<CacheEntry> {
  const supabase = await createClient()
  const { data: clients, error } = await supabase
    .from('panel_clients')
    .select('*, panel_whatsapp_config(*), panel_google_config(*), panel_bot_config(*)')
    .in('status', ['active', 'paused', 'disconnected'])
    .order('name')

  if (error) throw error

  const results = await Promise.allSettled(
    (clients as PanelClientWithRelations[]).map(buildAlertsForClient)
  )

  const alerts = results
    .filter((r): r is PromiseFulfilledResult<SOCAlert[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return { alerts, checked_at: new Date().toISOString() }
}

// --- Handler ---

export async function GET() {
  try {
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
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
