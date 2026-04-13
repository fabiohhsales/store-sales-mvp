// POST /api/desk/conversations/[id]/send-media
// Operador envia mídia via Evolution API e persiste no Supabase.
// Body: { base64: string, mimetype: string, caption?: string, file_name?: string }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser, applyRateLimit } from '@/lib/desk/auth'
import { RATE_LIMITS } from '@/lib/desk/rate-limit'
import { sendAudioMessage, sendMediaMessage } from '@/lib/api/evolution'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'

function resolveMediatype(mimetype: string): 'image' | 'document' | 'audio' | 'video' {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  return 'document'
}

const MAX_FILE_BYTES = 50 * 1024 * 1024

interface StorageUploadResult {
  storagePath: string | null
  errorMessage: string | null
}

function buildStoragePath(clientId: string, conversationId: string, messageId: string, mimetype: string): string {
  const ext = mimetype.split('/')[1]?.split(';')[0] ?? 'bin'
  return `${clientId}/${conversationId}/out-${messageId}.${ext}`
}

async function uploadOutboundMediaToStorage(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  conversationId: string,
  messageId: string,
  mimetype: string,
  fileBuffer: Buffer
): Promise<StorageUploadResult> {
  const storagePath = buildStoragePath(clientId, conversationId, messageId, mimetype)

  try {
    const { error: uploadError } = await admin.storage
      .from('desk-media')
      .upload(storagePath, fileBuffer, { contentType: mimetype, upsert: false })

    if (uploadError) {
      return { storagePath: null, errorMessage: uploadError.message }
    }

    return { storagePath, errorMessage: null }
  } catch (error) {
    return {
      storagePath: null,
      errorMessage: error instanceof Error ? error.message : 'storage_upload_failed',
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, RATE_LIMITS.send)
  if (blocked) return blocked

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

  let fileBuffer: Buffer
  try {
    fileBuffer = Buffer.from(base64, 'base64')
  } catch {
    return NextResponse.json({ error: 'Base64 inválido' }, { status: 400 })
  }

  if (fileBuffer.length > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Arquivo excede o limite de 50 MB' }, { status: 413 })
  }

  const admin = createAdminClient()

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
  const messageId = crypto.randomUUID()
  const mediaSizeBytes = fileBuffer.length

  let evolutionMsgId: string | null = null
  try {
    evolutionMsgId = mediatype === 'audio'
      ? await sendAudioMessage(instanceName, identifier, mimetype, base64, caption, file_name)
      : await sendMediaMessage(instanceName, identifier, mediatype, mimetype, base64, caption, file_name)
  } catch (error) {
    console.error('[desk/send-media] evolution send failed:', {
      conversationId: id,
      clientId: conv.client_id,
      mediatype,
      mimetype,
      fileName: file_name ?? null,
      error,
    })
    return NextResponse.json({ error: 'Falha ao enviar mídia no WhatsApp' }, { status: 502 })
  }

  const { storagePath, errorMessage: storageError } = await uploadOutboundMediaToStorage(
    admin,
    conv.client_id,
    id,
    messageId,
    mimetype,
    fileBuffer
  )

  const contentType = mediatype
  const { data: message, error } = await admin
    .from('messages')
    .insert({
      id: messageId,
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

  if (error) {
    console.error('[desk/send-media] insert error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }

  if (storageError) {
    console.warn('[desk/send-media] persisted without storage fallback:', {
      conversationId: id,
      messageId,
      evolutionMessageId: evolutionMsgId,
      mediatype,
      mimetype,
      fileName: file_name ?? null,
      error: storageError,
    })
  }

  await admin.from('conversations').update({
    last_outgoing_at: new Date().toISOString(),
    last_outgoing_by: 'operator',
  }).eq('id', id)

  return NextResponse.json(message)
}
