import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientById, updateClient, deleteClient } from '@/lib/db/clients'
import { deleteInstance } from '@/lib/api/evolution'
import { getWhatsAppConfigByClientId } from '@/lib/db/whatsapp-config'
import { insertAuditLog } from '@/lib/db/audit-log'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const client = await getClientById(id)

    return NextResponse.json(client)
  } catch (error) {
    console.error('Erro ao buscar cliente:', error)
    return NextResponse.json(
      { error: 'Cliente não encontrado' },
      { status: 404 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    const updated = await updateClient(id, body)

    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_updated',
      client_id: id,
      details: { updates: body },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar cliente' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params

    // Busca dados antes de deletar (pra log e cleanup)
    const client = await getClientById(id)

    // Tenta deletar a instância na Evolution API
    const whatsappConfig = await getWhatsAppConfigByClientId(id)
    if (whatsappConfig?.evolution_instance_name) {
      try {
        await deleteInstance(whatsappConfig.evolution_instance_name)
      } catch {
        // Ignora erro se instância já não existe na Evolution
      }
    }

    // Deleta do banco (cascata manual)
    await deleteClient(id)

    // Log de auditoria (salva antes de deletar o audit_log do cliente)
    // Como o audit_log do cliente já foi deletado, logamos sem client_id
    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_deleted',
      client_id: null,
      details: {
        deleted_client_name: client.name,
        deleted_client_id: id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar cliente:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar cliente' },
      { status: 500 }
    )
  }
}
