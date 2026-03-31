import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/embed-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/api/evolution'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, client_id, conversation_id, content } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id é obrigatório' }, { status: 400 })
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content é obrigatório' }, { status: 400 })
    }

    const auth = await authenticateRequest(token || null, client_id || null)
    const admin = createAdminClient()

    const { data: conv } = await admin
      .from('conversations')
      .select('id, client_id, contact_id')
      .eq('id', conversation_id)
      .eq('client_id', auth.client_id)
      .maybeSingle()

    if (!conv) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    const [{ data: contact }, { data: whatsappConfig }] = await Promise.all([
      admin
        .from('contacts')
        .select('identifier, phone_number')
        .eq('id', conv.contact_id)
        .maybeSingle(),
      admin
        .from('panel_whatsapp_config')
        .select('evolution_instance_name')
        .eq('client_id', auth.client_id)
        .maybeSingle(),
    ])

    const recipient = contact?.identifier ?? contact?.phone_number
    const instanceName = whatsappConfig?.evolution_instance_name

    if (!recipient || !instanceName) {
      return NextResponse.json({ error: 'Configuração de envio indisponível para a conversa' }, { status: 422 })
    }

    const text = content.trim()
    await sendTextMessage(instanceName, recipient, text)

    const now = new Date().toISOString()
    const { data: message, error: insertError } = await admin
      .from('messages')
      .insert({
        id: crypto.randomUUID(),
        conversation_id: conversation_id,
        client_id: auth.client_id,
        content: text,
        content_type: 'text',
        sender_type: 'operator',
        from_who: 'human',
        created_at: now,
      })
      .select('id, content, from_who, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    await admin
      .from('conversations')
      .update({
        last_outgoing_at: now,
        last_outgoing_by: 'operator',
      })
      .eq('id', conversation_id)

    return NextResponse.json(message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    const status = message.includes('autorizado') || message.includes('inválido') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
