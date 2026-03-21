import { createClient } from '@/lib/supabase/server'
import type {
  PanelGoogleConfig,
  PanelGoogleConfigInsert,
  PanelGoogleConfigUpdate,
} from '@/types/database'

export async function getGoogleConfigByClientId(
  clientId: string
): Promise<PanelGoogleConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_google_config')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) throw error
  return data as PanelGoogleConfig | null
}

export async function createGoogleConfig(
  config: PanelGoogleConfigInsert
): Promise<PanelGoogleConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_google_config')
    .insert(config)
    .select()
    .single()

  if (error) throw error
  return data as PanelGoogleConfig
}

export async function updateGoogleConfig(
  clientId: string,
  updates: PanelGoogleConfigUpdate
): Promise<PanelGoogleConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_google_config')
    .update(updates)
    .eq('client_id', clientId)
    .select()
    .single()

  if (error) throw error
  return data as PanelGoogleConfig
}

export async function upsertGoogleConfig(
  config: PanelGoogleConfigInsert
): Promise<PanelGoogleConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_google_config')
    .upsert(config, { onConflict: 'client_id' })
    .select()
    .single()

  if (error) throw error
  return data as PanelGoogleConfig
}
