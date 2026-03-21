import { createClient } from '@/lib/supabase/server'
import type { PanelAuditLog } from '@/types/database'

interface AuditLogInsert {
  admin_email: string
  action: string
  client_id?: string | null
  details?: Record<string, unknown> | null
}

export async function insertAuditLog(entry: AuditLogInsert): Promise<PanelAuditLog> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_audit_log')
    .insert(entry)
    .select()
    .single()

  if (error) throw error
  return data as PanelAuditLog
}

export async function listAuditLogsByClientId(
  clientId: string,
  limit = 50
): Promise<PanelAuditLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_audit_log')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data as PanelAuditLog[]
}

export async function listRecentAuditLogs(limit = 20): Promise<PanelAuditLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data as PanelAuditLog[]
}
