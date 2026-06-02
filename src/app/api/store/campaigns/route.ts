import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

export async function GET(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const accountId = session.accountId
  if (!accountId) {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from('store_campaigns')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (campErr) {
    return NextResponse.json({ error: campErr.message }, { status: 500 })
  }

  // Fetch segments
  const { data: segments, error: segErr } = await supabase
    .from('store_segments')
    .select('*')
    .eq('account_id', accountId)
    .order('name', { ascending: true })

  if (segErr) {
    return NextResponse.json({ error: segErr.message }, { status: 500 })
  }

  return NextResponse.json({ campaigns, segments })
}

export async function POST(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem disparar campanhas.' }, { status: 403 })
  }

  const accountId = session.accountId
  if (!accountId) {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  try {
    const { name, message_template, segment_id, scheduled_at } = await req.json()
    if (!name || !message_template) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes: nome, template da mensagem' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Get segment rules to filter contacts
    let contactIds: string[] = []
    
    if (segment_id) {
      const { data: segment } = await supabase
        .from('store_segments')
        .select('*')
        .eq('id', segment_id)
        .maybeSingle()

      if (segment) {
        const rules = segment.rules || {}
        
        let contactsQuery = supabase
          .from('store_contacts')
          .select('id, tags, state, city')
          .eq('account_id', accountId)

        if (rules.state) {
          contactsQuery = contactsQuery.eq('state', rules.state)
        }
        if (rules.city) {
          contactsQuery = contactsQuery.eq('city', rules.city)
        }

        const { data: contacts } = await contactsQuery

        if (contacts) {
          let filtered = contacts
          
          // Filter by tags if rules have tags list
          if (Array.isArray(rules.tags) && rules.tags.length > 0) {
            filtered = contacts.filter(c => 
              (c.tags || []).some((tag: string) => rules.tags.includes(tag))
            )
          }

          // Filter by lifecycle stage if profile rule exists
          if (rules.lifecycle_stage) {
            const contactIdsFilteredByTags = filtered.map(c => c.id)
            if (contactIdsFilteredByTags.length > 0) {
              const { data: profiles } = await supabase
                .from('store_contact_profiles')
                .select('contact_id')
                .in('contact_id', contactIdsFilteredByTags)
                .eq('lifecycle_stage', rules.lifecycle_stage)

              if (profiles) {
                const allowedIds = new Set(profiles.map(p => p.contact_id))
                filtered = filtered.filter(c => allowedIds.has(c.id))
              } else {
                filtered = []
              }
            } else {
              filtered = []
            }
          }

          contactIds = filtered.map(c => c.id)
        }
      }
    } else {
      // Fallback: No segment_id means ALL contacts
      const { data: allContacts } = await supabase
        .from('store_contacts')
        .select('id')
        .eq('account_id', accountId)

      if (allContacts) {
        contactIds = allContacts.map(c => c.id)
      }
    }

    if (contactIds.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato encontrado no segmento selecionado.' }, { status: 400 })
    }

    // 2. Insert campaign
    const campaignId = crypto.randomUUID()
    const status = scheduled_at ? 'scheduled' : 'sending' // starts sending or schedule it
    
    const { data: campaign, error: insertErr } = await supabase
      .from('store_campaigns')
      .insert({
        id: campaignId,
        account_id: accountId,
        store_id: session.activeStoreId || null,
        name,
        message_template,
        segment_id: segment_id || null,
        status,
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0,
      })
      .select()
      .single()

    if (insertErr) {
      throw insertErr
    }

    // 3. Populate store_campaign_audiences
    const audienceRows = contactIds.map(cid => ({
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      contact_id: cid,
      status: 'pending',
    }))

    const { error: audErr } = await supabase
      .from('store_campaign_audiences')
      .insert(audienceRows)

    if (audErr) {
      console.error('[Campaigns-API] Erro ao popular audiência:', audErr)
      await supabase.from('store_campaigns').delete().eq('id', campaignId)
      return NextResponse.json({ error: 'Falha ao processar audiência da campanha: ' + audErr.message }, { status: 500 })
    }

    return NextResponse.json(campaign)
  } catch (error: any) {
    console.error('[Campaigns-API] Erro ao criar campanha:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
