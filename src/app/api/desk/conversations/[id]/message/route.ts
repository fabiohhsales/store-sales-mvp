// POST /api/desk/conversations/[id]/message
// Operador envia mensagem manual via Evolution API e persiste no Supabase.
// Body: { content: string }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { sendTextMessage } from '@/lib/api/evolution'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const admin = createAdminClient()

  // Carrega conversa + contato + instância Evolution
  const { data: conv } = await admin
    .from('conversations')
    .select(`
      id, client_id, stage,
      contacts ( phone_number, identifier ),
      panel_clients!client_id (
        panel_whatsapp_config ( evolution_instance_name )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const contact = conv.contacts as { phone_number: string | null; identifier: string | null } | null
  const instanceName = (conv as Record<string, unknown>)
    ?.panel_clients?.panel_whatsapp_config?.evolution_instance_name as string | null

  if (!instanceName) {
    return NextResponse.json({ error: 'Instância WhatsApp não configurada' }, { status: 422 })
  }

  const identifier = contact?.identifier ?? contact?.phone_number
  if (!identifier) {
    return NextResponse.json({ error: 'Contato sem número WhatsApp' }, { status: 422 })
  }

  // Envia via Evolution API
  await sendTextMessage(instanceName, identifier, content.trim())

  // Persiste no Supabase
  const { data: message, error } = await admin
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: id,
      client_id: conv.client_id,
      content: content.trim(),
      content_type: 'text',
      sender_type: 'operator',
      from_who: 'human',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Atualiza timestamps da conversa
  await admin.from('conversations').update({
    last_outgoing_at: new Date().toISOString(),
    last_outgoing_by: 'operator',
  }).eq('id', id)

  return NextResponse.json(message)
}
