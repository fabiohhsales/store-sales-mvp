import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPanelSession } from '@/lib/auth/panel-session'
import { ingestProductDocument } from '@/lib/ai/rag'

export async function GET(req: NextRequest) {
  const session = await getPanelSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const clientId = session.clientId
  if (!clientId && session.role !== 'admin') {
    return NextResponse.json({ error: 'Nenhum cliente associado' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const targetClientId = clientId || searchParams.get('client_id')
  const storeId = searchParams.get('store_id')

  if (!targetClientId || !storeId) {
    return NextResponse.json({ error: 'Parâmetros client_id e store_id são obrigatórios' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('client_id', targetClientId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const session = await getPanelSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'operator' && session.clientRole === 'agent') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar produtos.' }, { status: 403 })
  }

  const clientId = session.clientId
  if (!clientId && session.role !== 'admin') {
    return NextResponse.json({ error: 'Nenhum cliente associado' }, { status: 400 })
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

    const targetClientId = clientId || body.client_id

    if (!targetClientId || !store_id || !name) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes: client_id, store_id, name' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Insert product
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        id: crypto.randomUUID(),
        client_id: targetClientId,
        store_id,
        name,
        normalized_name: name.trim().toLowerCase(),
        category,
        price_type: price_type || 'fixed',
        price_amount: price_amount ? Number(price_amount) : null,
        description_long,
        stock_quantity: stock_quantity ? Number(stock_quantity) : 0,
        pickup_available: !!pickup_available,
        delivery_available: !!delivery_available,
        assembly_included: !!assembly_included,
        delivery_region: delivery_region || 'Região da Loja',
        main_image_url,
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
Prazo/Região de entrega: ${product.delivery_region || 'Leopoldina e região'}
Retirada na Loja: ${product.pickup_available ? 'Disponível' : 'Indisponível'}
Entrega Disponível: ${product.delivery_available ? 'Sim' : 'Não'}
Montagem Inclusa: ${product.assembly_included ? 'Sim, inclusa' : 'Não inclusa'}
Descrição: ${product.description_long || 'Sem descrição detalhada.'}`

    try {
      await ingestProductDocument(targetClientId, store_id, product.id, detailsText, `RAG-${product.name}`)
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
