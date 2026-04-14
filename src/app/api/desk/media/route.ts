// GET /api/desk/media?msg_id=&conversation_id=&client_id=
// Resolve media from Storage and, for inbound messages, lazily repairs rows
// that were saved without media_url when the binary can still be recovered.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'
import { uploadMediaToStorage } from '@/lib/bot/media-storage'

interface MediaMessageRow {
  id: string
  evolution_message_id: string | null
  media_url: string | null
  media_mime_type: string | null
  sender_type: string
  from_who: string
}

function logMediaEvent(event: string, payload: Record<string, unknown>) {
  console.warn(`[desk/media] ${event}`, payload)
}

async function createMediaSignedUrl(
  admin: ReturnType<typeof createAdminClient>,
  mediaUrl: string
): Promise<string | null> {
  const { data: signedData, error } = await admin.storage
    .from('desk-media')
    .createSignedUrl(mediaUrl, 3600)

  if (error || !signedData?.signedUrl) {
    return null
  }

  return signedData.signedUrl
}

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return new NextResponse('N\u00e3o autenticado', { status: 401 })

  const msgId = request.nextUrl.searchParams.get('msg_id')
  const dbMsgId = request.nextUrl.searchParams.get('db_msg_id')
  const conversationId = request.nextUrl.searchParams.get('conversation_id')
  if ((!msgId && !dbMsgId) || !conversationId) {
    return new NextResponse('Par\u00e2metros inv\u00e1lidos', { status: 400 })
  }

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversations')
    .select(`
      client_id,
      contacts ( identifier, phone_number ),
      panel_clients!client_id ( panel_whatsapp_config ( evolution_instance_name ) )
    `)
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return new NextResponse('Conversa n\u00e3o encontrada', { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return new NextResponse('Acesso negado', { status: 403 })
  }

  const messageQuery = dbMsgId
    ? admin
        .from('messages')
        .select('id, evolution_message_id, media_url, media_mime_type, sender_type, from_who')
        .eq('id', dbMsgId)
        .maybeSingle()
    : admin
        .from('messages')
        .select('id, evolution_message_id, media_url, media_mime_type, sender_type, from_who')
        .eq('evolution_message_id', msgId!)
        .maybeSingle()

  const { data: messageRow } = await messageQuery
  const message = (messageRow ?? null) as MediaMessageRow | null

  if (dbMsgId) {
    if (!message) {
      logMediaEvent('db_msg_missing', {
        conversationId,
        dbMsgId,
      })
      return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
    }

    if (!message.media_url) {
      logMediaEvent('db_msg_without_media_url', {
        conversationId,
        dbMsgId,
        senderType: message.sender_type,
        fromWho: message.from_who,
        mimetype: message.media_mime_type,
      })
      return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
    }

    const signedUrl = await createMediaSignedUrl(admin, message.media_url)
    if (!signedUrl) {
      logMediaEvent('signed_url_failed', {
        conversationId,
        dbMsgId,
        mediaUrl: message.media_url,
        senderType: message.sender_type,
      })
      return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
    }

    return NextResponse.redirect(signedUrl, { status: 302 })
  }

  if (message?.media_url) {
    const signedUrl = await createMediaSignedUrl(admin, message.media_url)
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, { status: 302 })
    }

    logMediaEvent('signed_url_failed', {
      conversationId,
      msgId,
      mediaUrl: message.media_url,
      senderType: message.sender_type,
      fromWho: message.from_who,
    })
  } else {
    logMediaEvent('storage_missing_for_msg_id', {
      conversationId,
      msgId,
      hasMessageRow: Boolean(message),
    })
  }

  const contact = extractFirstContact(conv)
  const instanceName = extractEvolutionInstanceName(conv)
  if (!instanceName) {
    logMediaEvent('instance_missing', {
      conversationId,
      msgId,
    })
    return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
  }

  const remoteJid = contact?.identifier ?? (contact?.phone_number ? `${contact.phone_number}@s.whatsapp.net` : null)
  if (!remoteJid) {
    logMediaEvent('remote_jid_missing', {
      conversationId,
      msgId,
      hasIdentifier: Boolean(contact?.identifier),
      hasPhone: Boolean(contact?.phone_number),
    })
    return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
  }

  const recovered = await uploadMediaToStorage(
    instanceName,
    remoteJid,
    msgId!,
    conv.client_id,
    conversationId,
    message?.media_mime_type ?? 'application/octet-stream',
    null,
    (event, payload) => logMediaEvent(event, {
      conversationId,
      msgId,
      ...payload,
    })
  )

  if (!recovered.buffer) {
    return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
  }

  if (message?.id && recovered.storagePath) {
    const { error: updateError } = await admin
      .from('messages')
      .update({
        media_url: recovered.storagePath,
        media_mime_type: recovered.resolvedMime,
        media_size_bytes: recovered.buffer.length,
      })
      .eq('id', message.id)

    if (updateError) {
      logMediaEvent('media_backfill_failed', {
        conversationId,
        msgId,
        messageId: message.id,
        storagePath: recovered.storagePath,
        error: updateError.message,
      })
    } else {
      logMediaEvent('media_backfill_succeeded', {
        conversationId,
        msgId,
        messageId: message.id,
        storagePath: recovered.storagePath,
        source: recovered.source,
      })

      const signedUrl = await createMediaSignedUrl(admin, recovered.storagePath)
      if (signedUrl) {
        return NextResponse.redirect(signedUrl, { status: 302 })
      }

      logMediaEvent('media_backfill_failed', {
        conversationId,
        msgId,
        messageId: message.id,
        storagePath: recovered.storagePath,
        error: 'signed_url_failed_after_backfill',
      })
    }
  } else {
    logMediaEvent('media_backfill_failed', {
      conversationId,
      msgId,
      hasMessageRow: Boolean(message?.id),
      storagePath: recovered.storagePath,
      error: recovered.storagePath ? 'message_row_missing' : 'storage_path_missing',
    })
  }

  return new NextResponse(new Uint8Array(recovered.buffer), {
    headers: {
      'Content-Type': recovered.resolvedMime,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
