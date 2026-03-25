import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientById, updateClient, deleteClient } from '@/lib/db/clients'
import { deleteInstance } from '@/lib/api/evolution'
import { deleteChatwootAccount, deleteInbox } from '@/lib/api/chatwoot'
import { getWhatsAppConfigByClientId } from '@/lib/db/whatsapp-config'
import { insertAuditLog } from '@/lib/db/audit-log'

const CHATWOOT_MAIN_ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID || '1')

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

    const whatsappConfig = await getWhatsAppConfigByClientId(id)

    const warnings: string[] = []

    // 1. Tenta deletar a instância na Evolution API
    if (whatsappConfig?.evolution_instance_name) {
      try {
        await deleteInstance(whatsappConfig.evolution_instance_name)
      } catch {
        warnings.push(`Instância Evolution "${whatsappConfig.evolution_instance_name}" não encontrada (pode já ter sido removida)`)
      }
    }

    // 2. Tenta deletar Chatwoot (Account isolada ou inbox da Account principal)
    if (whatsappConfig?.chatwoot_account_id) {
      if (whatsappConfig.chatwoot_account_id === CHATWOOT_MAIN_ACCOUNT_ID) {
        // Account principal (compartilhada) — NÃO deletar, só remove a inbox
        if (whatsappConfig.chatwoot_inbox_id) {
          try {
            await deleteInbox(whatsappConfig.chatwoot_inbox_id)
          } catch {
            warnings.push(`Inbox #${whatsappConfig.chatwoot_inbox_id} da Account principal não foi deletada (pode já ter sido removida)`)
          }
        }
      } else if (whatsappConfig.chatwoot_agent_token) {
        // Account isolada do cliente — deleta a Account inteira
        const chatwootResult = await deleteChatwootAccount(
          whatsappConfig.chatwoot_account_id,
          whatsappConfig.chatwoot_agent_token
        )
        if (!chatwootResult.deleted) {
          warnings.push(`Account Chatwoot #${whatsappConfig.chatwoot_account_id} não foi deletada: ${chatwootResult.error}`)
        }
      }
    }

    // 3. Deleta do banco (FK CASCADE cuida das tabelas filhas)
    await deleteClient(id)

    // 4. Log de auditoria (client_id = null porque o cliente já foi deletado)
    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_deleted',
      client_id: null,
      details: {
        deleted_client_name: client.name,
        deleted_client_id: id,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    })

    return NextResponse.json({ success: true, warnings })
  } catch (error) {
    console.error('Erro ao deletar cliente:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar cliente' },
      { status: 500 }
    )
  }
}
