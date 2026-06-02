import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

export async function GET(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar configurações.' }, { status: 403 })
  }

  const accountId = session.accountId
  if (!accountId && session.role !== 'system_admin') {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const targetAccountId = accountId || searchParams.get('client_id') || searchParams.get('account_id')

  if (!targetAccountId) {
    return NextResponse.json({ error: 'account_id é obrigatório' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. Fetch stores
  const { data: stores } = await supabase
    .from('store_stores')
    .select('*')
    .eq('account_id', targetAccountId)

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
    .eq('client_id', targetAccountId)
    .maybeSingle()

  // 4. Fetch payment integrations
  const { data: integrations } = await supabase
    .from('store_payment_integrations')
    .select('provider, api_key, webhook_secret, is_active')
    .eq('account_id', targetAccountId)

  const maskedIntegrations = (integrations || []).map((integration) => ({
    provider: integration.provider,
    is_active: integration.is_active,
    api_key_configured: !!integration.api_key,
    webhook_secret_configured: !!integration.webhook_secret,
    api_key: integration.api_key ? `${integration.api_key.slice(0, 8)}...` : '',
    webhook_secret: integration.webhook_secret ? `${integration.webhook_secret.slice(0, 8)}...` : '',
  }))

  return NextResponse.json({ store, settings, botConfig, integrations: maskedIntegrations })
}

export async function POST(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar configurações.' }, { status: 403 })
  }

  const accountId = session.accountId
  if (!accountId && session.role !== 'system_admin') {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
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
      stripe_api_key,
      stripe_webhook_secret,
      stripe_active,
      abacate_api_key,
      abacate_webhook_secret,
      abacate_active,
    } = body

    const targetAccountId = accountId || body.client_id || body.account_id

    if (!targetAccountId) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes: account_id' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Create or Update Store
    let storeId: string
    const { data: existingStores } = await supabase
      .from('store_stores')
      .select('id')
      .eq('account_id', targetAccountId)
      .limit(1)

    // Se o nome não foi passado, tenta usar o nome do cliente
    let storeName = name
    if (!storeName) {
      const { data: accountData } = await supabase
        .from('store_accounts')
        .select('name')
        .eq('id', targetAccountId)
        .maybeSingle()
      
      if (!accountData) {
        // Fallback para panel_clients
        const { data: clientData } = await supabase
          .from('panel_clients')
          .select('name')
          .eq('id', targetAccountId)
          .maybeSingle()
        storeName = clientData ? `Loja - ${clientData.name}` : 'Minha Loja'
      } else {
        storeName = `Loja - ${accountData.name}`
      }
    }

    if (existingStores && existingStores.length > 0) {
      storeId = existingStores[0].id
      await supabase
        .from('store_stores')
        .update({ name: storeName, updated_at: new Date().toISOString() })
        .eq('id', storeId)
    } else {
      const { data: newStore, error: storeErr } = await supabase
        .from('store_stores')
        .insert({
          id: crypto.randomUUID(),
          account_id: targetAccountId,
          name: storeName,
        })
        .select()
        .single()

      if (storeErr) throw storeErr
      storeId = newStore.id
    }

    // 2. Find WhatsApp Config (if not provided, default to the first one)
    // Tenta encontrar em store_channels ou no panel_whatsapp_config legado para compatibilidade
    let wConfigId = whatsapp_config_id
    if (!wConfigId) {
      const { data: channelConfigs } = await supabase
        .from('store_channels')
        .select('id')
        .eq('account_id', targetAccountId)
        .limit(1)

      if (channelConfigs && channelConfigs.length > 0) {
        wConfigId = channelConfigs[0].id
      } else {
        const { data: whatsappConfigs } = await supabase
          .from('panel_whatsapp_config')
          .select('id')
          .eq('client_id', targetAccountId)
          .limit(1)

        if (whatsappConfigs && whatsappConfigs.length > 0) {
          wConfigId = whatsappConfigs[0].id
        }
      }
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
          channel_id: wConfigId || null,
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
          account_id: targetAccountId,
          store_id: storeId,
          channel_id: wConfigId || null,
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
        .eq('client_id', targetAccountId)
        .maybeSingle()

      if (existingBotConfig) {
        await supabase
          .from('panel_bot_config')
          .update(updates)
          .eq('client_id', targetAccountId)
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
            client_id: targetAccountId,
            professional_name: 'Vendedor Virtual',
            working_hours: defaultWorkingHours,
            business_segment: 'loja',
            ...updates,
          })
      }
    }

    // 5. Stripe Integration upsert
    if (stripe_api_key !== undefined || stripe_webhook_secret !== undefined || stripe_active !== undefined) {
      const { data: currentStripe } = await supabase
        .from('store_payment_integrations')
        .select('*')
        .eq('account_id', targetAccountId)
        .eq('provider', 'stripe')
        .maybeSingle()

      const apiKeyToSave = stripe_api_key && !stripe_api_key.includes('...') ? stripe_api_key : currentStripe?.api_key
      const webhookSecretToSave = stripe_webhook_secret && !stripe_webhook_secret.includes('...') ? stripe_webhook_secret : currentStripe?.webhook_secret
      const activeToSave = stripe_active !== undefined ? stripe_active : (currentStripe?.is_active ?? true)

      if (apiKeyToSave || webhookSecretToSave) {
        await supabase.from('store_payment_integrations').upsert({
          account_id: targetAccountId,
          provider: 'stripe',
          api_key: apiKeyToSave || null,
          webhook_secret: webhookSecretToSave || null,
          is_active: activeToSave,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'account_id,provider' })
      }
    }

    // 6. AbacatePay Integration upsert
    if (abacate_api_key !== undefined || abacate_webhook_secret !== undefined || abacate_active !== undefined) {
      const { data: currentAbacate } = await supabase
        .from('store_payment_integrations')
        .select('*')
        .eq('account_id', targetAccountId)
        .eq('provider', 'abacatepay')
        .maybeSingle()

      const apiKeyToSave = abacate_api_key && !abacate_api_key.includes('...') ? abacate_api_key : currentAbacate?.api_key
      const webhookSecretToSave = abacate_webhook_secret && !abacate_webhook_secret.includes('...') ? abacate_webhook_secret : currentAbacate?.webhook_secret
      const activeToSave = abacate_active !== undefined ? abacate_active : (currentAbacate?.is_active ?? true)

      if (apiKeyToSave || webhookSecretToSave) {
        await supabase.from('store_payment_integrations').upsert({
          account_id: targetAccountId,
          provider: 'abacatepay',
          api_key: apiKeyToSave || null,
          webhook_secret: webhookSecretToSave || null,
          is_active: activeToSave,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'account_id,provider' })
      }
    }

    return NextResponse.json({ store_id: storeId, settings: resultSettings })
  } catch (error: any) {
    console.error('[Store-Settings-API] Erro ao salvar configurações:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
