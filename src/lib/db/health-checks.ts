import { createClient } from '@/lib/supabase/server'
import type {
  PanelHealthCheck,
  HealthCheckService,
  HealthCheckStatus,
} from '@/types/database'

interface HealthCheckInsert {
  client_id: string
  service: HealthCheckService
  status: HealthCheckStatus
  details?: string | null
  response_time_ms?: number | null
}

export async function insertHealthCheck(entry: HealthCheckInsert): Promise<PanelHealthCheck> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_health_checks')
    .insert(entry)
    .select()
    .single()

  if (error) throw error
  return data as PanelHealthCheck
}

export async function getLatestHealthChecks(clientId: string): Promise<PanelHealthCheck[]> {
  const supabase = await createClient()

  // Busca o health check mais recente de cada servico para o cliente
  const { data, error } = await supabase
    .from('panel_health_checks')
    .select('*')
    .eq('client_id', clientId)
    .order('checked_at', { ascending: false })
    .limit(10)

  if (error) throw error

  // Filtra para manter apenas o mais recente de cada servico
  const latest = new Map<string, PanelHealthCheck>()
  for (const check of data as PanelHealthCheck[]) {
    if (!latest.has(check.service)) {
      latest.set(check.service, check)
    }
  }

  return Array.from(latest.values())
}
