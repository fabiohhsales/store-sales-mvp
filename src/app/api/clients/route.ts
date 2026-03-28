import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClientRecord, listClients } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { PanelClientInsert, ProvisionedChatwootAgent } from '@/types/database'
import type { ChatwootAgentRole } from '@/types/api'

function parseChatwootUsers(input: unknown): ProvisionedChatwootAgent[] {
  if (!Array.isArray(input)) return []

  const parsed = input
    .map((item) => {
      const record = item as Record<string, unknown>
      const name = typeof record?.name === 'string' ? record.name.trim() : ''
      const email = typeof record?.email === 'string' ? record.email.trim().toLowerCase() : ''
      const role: ChatwootAgentRole = record?.role === 'administrator' ? 'administrator' : 'agent'
      return { name, email, role }
    })
    .filter((item) => item.name.length > 0 || item.email.length > 0)

  if (parsed.some((item) => !item.name || !item.email)) {
    throw new Error('Todos os agentes Chatwoot devem ter nome e e-mail')
  }

  const invalidEmail = parsed.find((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))
  if (invalidEmail) {
    throw new Error(`E-mail invalido na lista de agentes: ${invalidEmail.email}`)
  }

  const emailSet = new Set(parsed.map((item) => item.email))
  if (emailSet.size !== parsed.length) {
    throw new Error('Nao repita e-mails na lista de agentes Chatwoot')
  }

  return parsed
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const clients = await listClients()
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Erro ao listar clientes:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, owner_name, email, phone, business_segment } = body

    let chatwootUsers: ProvisionedChatwootAgent[] = []
    try {
      chatwootUsers = parseChatwootUsers(body.chatwoot_users)
    } catch (payloadError) {
      const message = payloadError instanceof Error ? payloadError.message : 'Payload de agentes Chatwoot invalido'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    if (!name || !owner_name || !email) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: name, owner_name, email' },
        { status: 400 }
      )
    }

    const clientData: PanelClientInsert = {
      name,
      owner_name,
      email,
      phone: phone || null,
      provisioned_agents: chatwootUsers,
      status: 'draft',
    }

    const client = await createClientRecord(clientData)

    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_created',
      client_id: client.id,
      details: {
        name,
        owner_name,
        email,
        phone,
        business_segment,
        provisioned_agents_count: chatwootUsers.length,
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar cliente:', error)
    return NextResponse.json(
      { error: 'Erro interno ao criar cliente' },
      { status: 500 }
    )
  }
}
