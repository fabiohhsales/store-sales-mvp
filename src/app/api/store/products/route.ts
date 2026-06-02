import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'
import { ingestProductDocument } from '@/lib/ai/rag'

export async function GET(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const accountId = session.accountId
  if (!accountId && session.role !== 'system_admin') {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const targetAccountId = accountId || searchParams.get('client_id') || searchParams.get('account_id')
  const storeId = searchParams.get('store_id')

  if (!targetAccountId) {
    return NextResponse.json({ error: 'Parâmetro account_id ou client_id é obrigatório' }, { status: 400 })
  }

  const supabase = createAdminClient()
  let query = supabase
    .from('store_products')
    .select('*')
    .eq('account_id', targetAccountId)
    .order('created_at', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: products, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar produtos.' }, { status: 403 })
  }

  const accountId = session.accountId
  if (!accountId && session.role !== 'system_admin') {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const {
      store_id,
      name,
      category,
      price_type,
      price_amount,
      description_long,
      stock_quantity,
      pickup_available,
      delivery_available,
      assembly_included,
      delivery_region,
      main_image_url,
    } = body

    const targetAccountId = accountId || body.client_id || body.account_id

    if (!targetAccountId || !name) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes: account_id, name' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Insert product
    const { data: product, error } = await supabase
      .from('store_products')
      .insert({
        id: crypto.randomUUID(),
        account_id: targetAccountId,
        store_id: store_id || null,
        name,
        normalized_name: name.trim().toLowerCase(),
        category: category || 'Móveis',
        price_type: price_type || 'fixed',
        price_amount: price_amount ? Number(price_amount) : null,
        description_long: description_long || '',
        stock_quantity: stock_quantity ? Number(stock_quantity) : 0,
        pickup_available: pickup_available !== false,
        delivery_available: delivery_available !== false,
        assembly_included: !!assembly_included,
        delivery_region: delivery_region || 'Região da Loja',
        main_image_url: main_image_url || '',
        status: 'active', // active by default for MVP ease of testing
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // 2. Ingest document for RAG search
    const detailsText = `Produto: ${product.name}
Preço: ${product.price_amount ? `R$ ${product.price_amount}` : 'A combinar (sob consulta)'}
Categoria: ${product.category || 'Móveis'}
Prazo/Região de entrega: ${product.delivery_region || 'Região da loja'}
Retirada na Loja: ${product.pickup_available ? 'Disponível' : 'Indisponível'}
Entrega Disponível: ${product.delivery_available ? 'Sim' : 'Não'}
Montagem Inclusa: ${product.assembly_included ? 'Sim, inclusa' : 'Não inclusa'}
Descrição: ${product.description_long || 'Sem descrição detalhada.'}`

    try {
      await ingestProductDocument(targetAccountId, store_id || product.id, product.id, detailsText, `RAG-${product.name}`)
      console.log(`[Store-API] Produto ${product.id} indexado no RAG com sucesso.`)
    } catch (ragErr) {
      console.error(`[Store-API] Falha ao indexar produto ${product.id} no RAG:`, ragErr)
    }

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('[Store-API] Erro ao cadastrar produto:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
