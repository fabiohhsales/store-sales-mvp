import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

export async function POST(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (session.role === 'seller' || session.role === 'viewer') {
    return NextResponse.json({ error: 'Acesso negado: apenas administradores do cliente podem realizar upload de imagens.' }, { status: 403 })
  }

  const accountId = session.accountId
  if (!accountId && session.role !== 'system_admin') {
    return NextResponse.json({ error: 'Nenhuma conta associada' }, { status: 400 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const paramAccountId = formData.get('client_id') as string | null || formData.get('account_id') as string | null

    const targetAccountId = accountId || paramAccountId

    if (!targetAccountId) {
      return NextResponse.json({ error: 'Parâmetro account_id ou client_id é obrigatório' }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    // Validar tipo de arquivo
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido. Apenas JPG, PNG, WEBP e GIF.' }, { status: 400 })
    }

    // Validar tamanho do arquivo (máx 10MB)
    const maxSizeBytes = 10 * 1024 * 1024
    if (file.size > maxSizeBytes) {
      return NextResponse.json({ error: 'O tamanho do arquivo excede o limite de 10MB.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // Obter extensão
    const extension = file.name.split('.').pop() || 'png'
    const fileName = `${crypto.randomUUID()}.${extension}`
    const filePath = `${targetAccountId}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error } = await supabase.storage
      .from('store-products')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      console.error('[Upload-Image-API] Erro no upload:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('store-products')
      .getPublicUrl(filePath)

    return NextResponse.json({ publicUrl })
  } catch (error: any) {
    console.error('[Upload-Image-API] Erro ao processar upload:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
