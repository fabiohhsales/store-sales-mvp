import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClientRecord } from '@/lib/db/clients'
import { insertAuditLog } from '@/lib/db/audit-log'
import type { PanelClientInsert } from '@/types/database'

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
      status: 'draft',
    }

    const client = await createClientRecord(clientData)

    await insertAuditLog({
      admin_email: user.email!,
      action: 'client_created',
      client_id: client.id,
      details: { name, owner_name, email, phone, business_segment },
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
