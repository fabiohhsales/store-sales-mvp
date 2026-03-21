import { createClient } from '@/lib/supabase/server'
import type {
  PanelWhatsAppConfig,
  PanelWhatsAppConfigInsert,
  PanelWhatsAppConfigUpdate,
} from '@/types/database'

export async function getWhatsAppConfigByClientId(
  clientId: string
): Promise<PanelWhatsAppConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_whatsapp_config')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) throw error
  return data as PanelWhatsAppConfig | null
}

export async function getWhatsAppConfigByInstanceName(
  instanceName: string
): Promise<PanelWhatsAppConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_whatsapp_config')
    .select('*')
    .eq('evolution_instance_name', instanceName)
    .maybeSingle()

  if (error) throw error
  return data as PanelWhatsAppConfig | null
}

export async function createWhatsAppConfig(
  config: PanelWhatsAppConfigInsert
): Promise<PanelWhatsAppConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_whatsapp_config')
    .insert(config)
    .select()
    .single()

  if (error) throw error
  return data as PanelWhatsAppConfig
}

export async function updateWhatsAppConfig(
  clientId: string,
  updates: PanelWhatsAppConfigUpdate
): Promise<PanelWhatsAppConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('panel_whatsapp_config')
    .update(updates)
    .eq('client_id', clientId)
    .select()
    .single()

  if (error) throw error
  return data as PanelWhatsAppConfig
}
