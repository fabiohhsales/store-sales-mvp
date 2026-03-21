import { createClient } from '@/lib/supabase/server'
import type {
  PanelBotConfig,
  PanelBotConfigInsert,
  PanelBotConfigUpdate,
} from '@/types/database'

export async function getBotConfigByClientId(clientId: string): Promise<PanelBotConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_bot_config')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) throw error
  return data as PanelBotConfig | null
}

export async function createBotConfig(config: PanelBotConfigInsert): Promise<PanelBotConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_bot_config')
    .insert(config)
    .select()
    .single()

  if (error) throw error
  return data as PanelBotConfig
}

export async function updateBotConfig(
  clientId: string,
  updates: PanelBotConfigUpdate
): Promise<PanelBotConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_bot_config')
    .update(updates)
    .eq('client_id', clientId)
    .select()
    .single()

  if (error) throw error
  return data as PanelBotConfig
}

export async function upsertBotConfig(config: PanelBotConfigInsert): Promise<PanelBotConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_bot_config')
    .upsert(config, { onConflict: 'client_id' })
    .select()
    .single()

  if (error) throw error
  return data as PanelBotConfig
}
