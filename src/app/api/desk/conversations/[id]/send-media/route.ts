// POST /api/desk/conversations/[id]/send-media
// Operador envia imagem/documento via Evolution API e persiste no Supabase.
// Body: { base64: string, mimetype: string, caption?: string, file_name?: string }
// Tipos suportados: image/*, application/pdf, video/mp4, audio/*

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { sendMediaMessage } from '@/lib/api/evolution'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'

// Mapeia mimetype → mediatype da Evolution
function resolveMediatype(mimetype: string): 'image' | 'document' | 'audio' | 'video' {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  return 'document'
}

// Limite de payload: 10 MB em base64 (~7.5 MB de arquivo)
const MAX_BASE64_BYTES = 10 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { base64, mimetype, caption, file_name } = body as {
    base64?: string
    mimetype?: string
    caption?: string
    file_name?: string
  }

  if (!base64 || !mimetype) {
    return NextResponse.json({ error: 'base64 e mimetype são obrigatórios' }, { status: 400 })
  }
  if (Buffer.byteLength(base64, 'utf8') > MAX_BASE64_BYTES) {
    return NextResponse.json({ error: 'Arquivo excede o limite de 10 MB' }, { status: 413 })
  }

  const admin = createAdminClient()

  // Carrega conversa + instância Evolution
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
  if (conv.stage !== 'in_service') {
    return NextResponse.json({ error: 'Operador deve assumir a conversa antes de enviar mídia' }, { status: 422 })
  }

  const contact = extractFirstContact(conv)
  const instanceName = extractEvolutionInstanceName(conv)

  if (!instanceName) {
    return NextResponse.json({ error: 'Instância WhatsApp não configurada' }, { status: 422 })
  }

  const identifier = contact?.identifier ?? contact?.phone_number
  if (!identifier) {
    return NextResponse.json({ error: 'Contato sem número WhatsApp' }, { status: 422 })
  }

  const mediatype = resolveMediatype(mimetype)

  // Envia via Evolution API — captura o message ID para rastreamento de entrega
  const evolutionMsgId = await sendMediaMessage(instanceName, identifier, mediatype, mimetype, base64, caption, file_name)

  // Upload para Supabase Storage para persistência
  let storagePath: string | null = null
  try {
    const ext = mimetype.split('/')[1]?.split(';')[0] ?? 'bin'
    const msgId = crypto.randomUUID()
    storagePath = `${conv.client_id}/${id}/out-${msgId}.${ext}`
    const buffer = Buffer.from(base64, 'base64')
    const { error: uploadError } = await admin.storage
      .from('desk-media')
      .upload(storagePath, buffer, { contentType: mimetype, upsert: false })
    if (uploadError) {
      console.warn('[send-media] Erro ao fazer upload para Storage:', uploadError.message)
      storagePath = null
    }
  } catch {
    storagePath = null
  }

  // Persiste no Supabase com content_type fiel ao tipo real da mídia
  const contentType = mediatype // image | audio | video | document
  const mediaSizeBytes = Math.floor(Buffer.byteLength(base64, 'utf8') * 0.75) // base64 → bytes reais (aprox)
  const { data: message, error } = await admin
    .from('messages')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: id,
      client_id: conv.client_id,
      content: caption ?? file_name ?? `[${contentType}]`,
      content_type: contentType,
      sender_type: 'operator',
      from_who: 'human',
      evolution_message_id: evolutionMsgId ?? null,
      media_url: storagePath,
      media_mime_type: mimetype,
      media_filename: file_name ?? null,
      media_size_bytes: mediaSizeBytes,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('conversations').update({
    last_outgoing_at: new Date().toISOString(),
    last_outgoing_by: 'operator',
  }).eq('id', id)

  return NextResponse.json(message)
}
