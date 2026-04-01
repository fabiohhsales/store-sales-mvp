import { createAdminClient } from '@/lib/supabase/admin'
import { fetchInstances, getConnectionState } from '@/lib/api/evolution'

export type WhatsAppConnectionApiState = 'open' | 'connecting' | 'disconnected' | 'error'

export interface WhatsAppConnectionSnapshot {
  instanceName: string
  state: WhatsAppConnectionApiState
  connectedPhone: string | null
  lastUpdatedAt: string
  source: 'reconcile' | 'webhook'
}

type EvolutionFetchInstanceEntry = Awaited<ReturnType<typeof fetchInstances>>[number]

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

function normalizeEvolutionState(state: string | null | undefined): WhatsAppConnectionApiState {
  if (state === 'open') return 'open'
  if (state === 'connecting') return 'connecting'
  if (state === 'close' || state === 'disconnected') return 'disconnected'
  return 'error'
}

function extractConnectedPhone(instance: EvolutionFetchInstanceEntry | null): string | null {
  if (!instance) return null

  return (
    normalizePhone(instance.instance.owner) ??
    normalizePhone(instance.instance.profileName) ??
    null
  )
}

function toDbConnectionStatus(state: WhatsAppConnectionApiState): 'open' | 'connecting' | 'disconnected' {
  if (state === 'open') return 'open'
  if (state === 'connecting') return 'connecting'
  return 'disconnected'
}

export function formatConnectionPayload(snapshot: WhatsAppConnectionSnapshot) {
  return {
    instance: snapshot.instanceName,
    state: snapshot.state,
    base64: null as string | null,
    pairingCode: null as string | null,
    connectedPhone: snapshot.connectedPhone,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function readConnectionSnapshot(
  instanceName: string
): Promise<WhatsAppConnectionSnapshot> {
  const [connectionState, instancesResult] = await Promise.allSettled([
    getConnectionState(instanceName),
    fetchInstances(),
  ])

  const baseState =
    connectionState.status === 'fulfilled'
      ? normalizeEvolutionState(connectionState.value.instance?.state)
      : 'error'

  const matchedInstance =
    instancesResult.status === 'fulfilled'
      ? instancesResult.value.find((entry) => entry.instance.instanceName === instanceName) ?? null
      : null

  const derivedState = matchedInstance
    ? normalizeEvolutionState(matchedInstance.instance.status)
    : baseState

  const state =
    baseState === 'open' || derivedState === 'open'
      ? 'open'
      : baseState === 'connecting' || derivedState === 'connecting'
        ? 'connecting'
        : baseState === 'error' && !matchedInstance
          ? 'error'
          : 'disconnected'

  return {
    instanceName,
    state,
    connectedPhone: state === 'open' ? extractConnectedPhone(matchedInstance) : null,
    lastUpdatedAt: new Date().toISOString(),
    source: 'reconcile',
  }
}

export async function persistConnectionSnapshot(
  snapshot: WhatsAppConnectionSnapshot
): Promise<void> {
  const supabase = createAdminClient()
  const dbStatus = toDbConnectionStatus(snapshot.state)
  const updates: Record<string, unknown> = {
    connection_status: dbStatus,
    connected_phone: snapshot.state === 'open' ? snapshot.connectedPhone : null,
    updated_at: snapshot.lastUpdatedAt,
  }

  if (snapshot.state === 'open') {
    updates.connected_at = snapshot.lastUpdatedAt
    updates.disconnected_at = null
  } else if (snapshot.state === 'disconnected' || snapshot.state === 'error') {
    updates.disconnected_at = snapshot.lastUpdatedAt
  }

  const { data: config, error: configError } = await supabase
    .from('panel_whatsapp_config')
    .update(updates)
    .eq('evolution_instance_name', snapshot.instanceName)
    .select('client_id')
    .maybeSingle()

  if (configError) {
    throw new Error(`Falha ao atualizar panel_whatsapp_config: ${configError.message}`)
  }

  if (!config?.client_id) return

  if (snapshot.state === 'open') {
    const { error } = await supabase
      .from('panel_clients')
      .update({ status: 'pending_google' })
      .eq('id', config.client_id)
      .in('status', ['pending_whatsapp', 'disconnected'])

    if (error) {
      throw new Error(`Falha ao atualizar panel_clients: ${error.message}`)
    }
  }
}

export async function reconcileConnectionState(instanceName: string) {
  const snapshot = await readConnectionSnapshot(instanceName)
  await persistConnectionSnapshot(snapshot)
  return snapshot
}

export async function syncConnectionStateFromWebhook(
  instanceName: string,
  rawState: string | null | undefined
) {
  const snapshot: WhatsAppConnectionSnapshot = {
    instanceName,
    state: normalizeEvolutionState(rawState),
    connectedPhone: null,
    lastUpdatedAt: new Date().toISOString(),
    source: 'webhook',
  }

  await persistConnectionSnapshot(snapshot)
  return snapshot
}
