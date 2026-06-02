import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

export async function POST(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem gerenciar segmentos.' }, { status: 403 })
  }

  const accountId = session.accountId
  if (!accountId) {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  try {
    const { name, description, rules } = await req.json()
    if (!name) {
      return NextResponse.json({ error: 'Nome do segmento é obrigatório.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: segment, error } = await supabase
      .from('store_segments')
      .insert({
        id: crypto.randomUUID(),
        account_id: accountId,
        name,
        description: description || '',
        rules: rules || {},
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(segment)
  } catch (error: any) {
    console.error('[Segments-API] Erro ao criar segmento:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const accountId = session.accountId
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID do segmento é obrigatório.' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('store_segments')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Segments-API] Erro ao deletar segmento:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
