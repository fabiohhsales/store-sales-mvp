import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  PanelClient,
  PanelClientInsert,
  PanelClientUpdate,
  PanelClientWithRelations,
} from '@/types/database'

export async function listClients(): Promise<PanelClientWithRelations[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_clients')
    .select('*, panel_whatsapp_config(*), panel_google_config(*), panel_bot_config(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as PanelClientWithRelations[]
}

/**
 * Lista clientes usando service role key (bypassa RLS).
 * Usar em server components onde o usuário logado pode não ter
 * policy de SELECT no panel_clients (e.g. operadores).
 */
export async function listClientsAdmin(): Promise<PanelClientWithRelations[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('panel_clients')
    .select('*, panel_whatsapp_config(*), panel_google_config(*), panel_bot_config(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as PanelClientWithRelations[]
}

export async function getClientById(id: string): Promise<PanelClientWithRelations> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_clients')
    .select('*, panel_whatsapp_config(*), panel_google_config(*), panel_bot_config(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as PanelClientWithRelations
}

export async function createClientRecord(client: PanelClientInsert): Promise<PanelClient> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_clients')
    .insert(client)
    .select()
    .single()

  if (error) throw error
  return data as PanelClient
}

export async function updateClient(id: string, updates: PanelClientUpdate): Promise<PanelClient> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as PanelClient
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = await createClient()

  // Deleta registros dependentes (FK cascade não configurado)
  await supabase.from('panel_health_checks').delete().eq('client_id', id)
  await supabase.from('panel_audit_log').delete().eq('client_id', id)
  await supabase.from('panel_bot_config').delete().eq('client_id', id)
  await supabase.from('panel_google_config').delete().eq('client_id', id)
  await supabase.from('panel_whatsapp_config').delete().eq('client_id', id)

  const { error } = await supabase
    .from('panel_clients')
    .delete()
    .eq('id', id)

  if (error) throw error
}
