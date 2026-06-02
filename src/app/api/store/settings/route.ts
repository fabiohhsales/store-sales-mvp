import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPanelSession } from '@/lib/auth/panel-session'

export async function GET(req: NextRequest) {
  const session = await getPanelSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'operator' && session.clientRole === 'agent') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar configurações.' }, { status: 403 })
  }

  const clientId = session.clientId
  if (!clientId && session.role !== 'admin') {
    return NextResponse.json({ error: 'Nenhum cliente associado' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const targetClientId = clientId || searchParams.get('client_id')

  if (!targetClientId) {
    return NextResponse.json({ error: 'client_id é obrigatório' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. Fetch stores
  const { data: stores } = await supabase
    .from('stores')
    .select('*')
    .eq('client_id', targetClientId)

  if (!stores || stores.length === 0) {
    return NextResponse.json({ store: null, settings: null, botConfig: null })
  }

  const store = stores[0]

  // 2. Fetch settings
  const { data: settings } = await supabase
    .from('store_agent_settings')
    .select('*')
    .eq('store_id', store.id)
    .maybeSingle()

  // 3. Fetch bot config (stages & followups)
  const { data: botConfig } = await supabase
    .from('panel_bot_config')
    .select('stage_labels, lead_followup_enabled, lead_followup_steps, atendimento_followup_enabled, atendimento_followup_steps')
    .eq('client_id', targetClientId)
    .maybeSingle()

  return NextResponse.json({ store, settings, botConfig })
}

export async function POST(req: NextRequest) {
  const session = await getPanelSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'operator' && session.clientRole === 'agent') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar configurações.' }, { status: 403 })
  }

  const clientId = session.clientId
  if (!clientId && session.role !== 'admin') {
    return NextResponse.json({ error: 'Nenhum cliente associado' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const {
      name,
      agent_name,
      tone_of_voice,
      auto_reply_enabled,
      rag_enabled,
      human_handoff_enabled,
      fallback_message,
      whatsapp_config_id,
      stage_labels,
      lead_followup_enabled,
      lead_followup_steps,
      atendimento_followup_enabled,
      atendimento_followup_steps,
    } = body

    const targetClientId = clientId || body.client_id

    if (!targetClientId) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes: client_id' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Create or Update Store
    let storeId: string
    const { data: existingStores } = await supabase
      .from('stores')
      .select('id')
      .eq('client_id', targetClientId)
      .limit(1)

    // Se o nome não foi passado, tenta usar o nome do cliente
    let storeName = name
    if (!storeName) {
      const { data: clientData } = await supabase
        .from('panel_clients')
        .select('name')
        .eq('id', targetClientId)
        .maybeSingle()
      storeName = clientData ? `Loja - ${clientData.name}` : 'Minha Loja'
    }

    if (existingStores && existingStores.length > 0) {
      storeId = existingStores[0].id
      await supabase
        .from('stores')
        .update({ name: storeName, updated_at: new Date().toISOString() })
        .eq('id', storeId)
    } else {
      const { data: newStore, error: storeErr } = await supabase
        .from('stores')
        .insert({
          id: crypto.randomUUID(),
          client_id: targetClientId,
          name: storeName,
        })
        .select()
        .single()

      if (storeErr) throw storeErr
      storeId = newStore.id
    }

    // 2. Find WhatsApp Config (if not provided, default to the first one)
    let wConfigId = whatsapp_config_id
    if (!wConfigId) {
      const { data: whatsappConfigs } = await supabase
        .from('panel_whatsapp_config')
        .select('id')
        .eq('client_id', targetClientId)
        .limit(1)

      if (whatsappConfigs && whatsappConfigs.length > 0) {
        wConfigId = whatsappConfigs[0].id
      }
    }

    if (!wConfigId) {
      return NextResponse.json({ error: 'Nenhum canal de WhatsApp (Evolution) conectado para este cliente.' }, { status: 400 })
    }

    // 3. Create or Update Settings
    const { data: existingSettings } = await supabase
      .from('store_agent_settings')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle()

    let resultSettings
    if (existingSettings) {
      const { data: updated, error: setErr } = await supabase
        .from('store_agent_settings')
        .update({
          agent_name: agent_name || 'Assistente da Loja',
          tone_of_voice: tone_of_voice || 'consultivo, objetivo e cordial',
          auto_reply_enabled: auto_reply_enabled !== false,
          rag_enabled: rag_enabled !== false,
          human_handoff_enabled: human_handoff_enabled !== false,
          fallback_message,
          whatsapp_config_id: wConfigId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSettings.id)
        .select()
        .single()

      if (setErr) throw setErr
      resultSettings = updated
    } else {
      const { data: created, error: setErr } = await supabase
        .from('store_agent_settings')
        .insert({
          id: crypto.randomUUID(),
          client_id: targetClientId,
          store_id: storeId,
          whatsapp_config_id: wConfigId,
          agent_name: agent_name || 'Assistente da Loja',
          tone_of_voice: tone_of_voice || 'consultivo, objetivo e cordial',
          auto_reply_enabled: auto_reply_enabled !== false,
          rag_enabled: rag_enabled !== false,
          human_handoff_enabled: human_handoff_enabled !== false,
          fallback_message,
        })
        .select()
        .single()

      if (setErr) throw setErr
      resultSettings = created
    }

    // 4. Create or Update panel_bot_config (stages & followups)
    const updates: any = {}
    if (stage_labels) updates.stage_labels = stage_labels
    if (typeof lead_followup_enabled === 'boolean') updates.lead_followup_enabled = lead_followup_enabled
    if (lead_followup_steps) updates.lead_followup_steps = lead_followup_steps
    if (typeof atendimento_followup_enabled === 'boolean') updates.atendimento_followup_enabled = atendimento_followup_enabled
    if (atendimento_followup_steps) updates.atendimento_followup_steps = atendimento_followup_steps

    if (Object.keys(updates).length > 0) {
      const { data: existingBotConfig } = await supabase
        .from('panel_bot_config')
        .select('id')
        .eq('client_id', targetClientId)
        .maybeSingle()

      if (existingBotConfig) {
        await supabase
          .from('panel_bot_config')
          .update(updates)
          .eq('client_id', targetClientId)
      } else {
        const defaultWorkingHours = {
          monday: { enabled: true, start: '08:00', end: '18:00', break_start: null, break_end: null },
          tuesday: { enabled: true, start: '08:00', end: '18:00', break_start: null, break_end: null },
          wednesday: { enabled: true, start: '08:00', end: '18:00', break_start: null, break_end: null },
          thursday: { enabled: true, start: '08:00', end: '18:00', break_start: null, break_end: null },
          friday: { enabled: true, start: '08:00', end: '18:00', break_start: null, break_end: null },
          saturday: { enabled: false, start: '08:00', end: '12:00', break_start: null, break_end: null },
          sunday: { enabled: false, start: '08:00', end: '12:00', break_start: null, break_end: null },
        }

        await supabase
          .from('panel_bot_config')
          .insert({
            id: crypto.randomUUID(),
            client_id: targetClientId,
            professional_name: 'Vendedor Virtual',
            working_hours: defaultWorkingHours,
            business_segment: 'loja',
            ...updates,
          })
      }
    }

    return NextResponse.json({ store_id: storeId, settings: resultSettings })
  } catch (error: any) {
    console.error('[Store-Settings-API] Erro ao salvar configurações:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
