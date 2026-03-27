// SOC — Centro de Operações: agrega alertas conhecidos de todos os clientes ativos/pausados/desconectados.

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

// Timeout para cada chamada à Evolution API (ms)
const EVOLUTION_TIMEOUT_MS = 5000

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

  // Cliente pausado intencionalmente — info
  if (client.status === 'paused') {
    alerts.push({
      id: `${client.id}:paused`,
      client_id: client.id as string,
      client_name: client.name,
      severity: 'info',
      type: 'client_paused',
      message: 'Bot pausado — não responde mensagens enquanto pausado',
      action_url: url,
    })
    return alerts
  }

  // Cliente com status desconectado no painel
  if (client.status === 'disconnected') {
    alerts.push({
      id: `${client.id}:client_disconnected`,
      client_id: client.id as string,
      client_name: client.name,
      severity: 'critical',
      type: 'client_disconnected',
      message: 'Cliente marcado como desconectado no painel',
      action_url: url,
    })
    return alerts
  }

  // A partir daqui, cliente ativo
  const whatsapp = client.panel_whatsapp_config

  // Sem instância WhatsApp configurada
  if (!whatsapp?.evolution_instance_name) {
    alerts.push({
      id: `${client.id}:whatsapp_missing`,
      client_id: client.id as string,
      client_name: client.name,
      severity: 'critical',
      type: 'whatsapp_missing',
      message: 'WhatsApp não configurado — instância Evolution inexistente',
      action_url: url,
    })
  } else {
    // Verifica estado real-time na Evolution API
    try {
      const state = await checkWhatsAppState(whatsapp.evolution_instance_name)
      if (state === 'close') {
        alerts.push({
          id: `${client.id}:whatsapp_disconnected`,
          client_id: client.id as string,
          client_name: client.name,
          severity: 'critical',
          type: 'whatsapp_disconnected',
          message: 'WhatsApp desconectado — bot não consegue enviar mensagens (reconectar QR)',
          action_url: url,
        })
      } else if (state === 'connecting') {
        alerts.push({
          id: `${client.id}:whatsapp_connecting`,
          client_id: client.id as string,
          client_name: client.name,
          severity: 'warning',
          type: 'whatsapp_connecting',
          message: 'WhatsApp aguardando conexão — escaneie o QR code',
          action_url: url,
        })
      }
    } catch {
      alerts.push({
        id: `${client.id}:whatsapp_unreachable`,
        client_id: client.id as string,
        client_name: client.name,
        severity: 'critical',
        type: 'whatsapp_unreachable',
        message: 'Evolution API inacessível — não foi possível verificar WhatsApp',
        action_url: url,
      })
    }
  }

  // Google Calendar ausente
  if (!client.panel_google_config?.google_email) {
    alerts.push({
      id: `${client.id}:google_missing`,
      client_id: client.id as string,
      client_name: client.name,
      severity: 'warning',
      type: 'google_missing',
      message: 'Google Calendar não conectado — agendamentos indisponíveis',
      action_url: url,
    })
  }

  // Bot sem configuração
  if (!client.panel_bot_config) {
    alerts.push({
      id: `${client.id}:bot_config_missing`,
      client_id: client.id as string,
      client_name: client.name,
      severity: 'warning',
      type: 'bot_config_missing',
      message: 'Bot sem configuração — system prompt vazio',
      action_url: url,
    })
  }

  return alerts
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }

export async function GET() {
  try {
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

    return NextResponse.json({ alerts, checked_at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
