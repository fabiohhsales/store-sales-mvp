// GET /api/desk/media?msg_id=&conversation_id=&client_id=
// Resolve media from Storage and lazily repair rows that were saved without
// media_url when the binary can still be recovered from Evolution.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'
import { isImageMime, sniffMimeFromBuffer, uploadMediaToStorage } from '@/lib/bot/media-storage'

interface MediaMessageRow {
  id: string
  content_type: string
  evolution_message_id: string | null
  media_url: string | null
  media_mime_type: string | null
  sender_type: string
  from_who: string
}

function logMediaEvent(event: string, payload: Record<string, unknown>) {
  console.warn(`[desk/media] ${event}`, payload)
}

function isAudioContent(
  contentType: string | undefined | null,
  mimeType: string | undefined | null
): boolean {
  return contentType === 'audio' || (typeof mimeType === 'string' && mimeType.startsWith('audio/'))
}

function resolveAudioContentType(
  resolvedMime: string,
  contentType: string | undefined | null,
  logger?: (event: string, payload: Record<string, unknown>) => void,
  meta: Record<string, unknown> = {}
): string {
  if (resolvedMime.startsWith('audio/')) return resolvedMime
  if (contentType === 'audio') {
    logger?.('audio_mime_fallback_applied', { ...meta, resolvedMime, fallback: 'audio/ogg' })
    return 'audio/ogg'
  }
  return resolvedMime
}

/**
 * Serve an audio buffer inline with proper Range support.
 *
 * The browser's <audio> element always sends a Range request before playing
 * (especially Safari, which REQUIRES a 206 response — 200 causes silence).
 * Without Content-Length + Accept-Ranges + 206 handling, audio plays on no browser reliably.
 */
function serveAudioInline(
  buf: Buffer,
  contentType: string,
  request: NextRequest
): NextResponse {
  const rangeHeader = request.headers.get('range')
  const total = buf.length

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0
      const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1
      const chunkLength = end - start + 1
      const slice = buf.subarray(start, end + 1)
      return new NextResponse(new Uint8Array(slice), {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': String(chunkLength),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  })
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

async function validateStoredImageObject(
  admin: ReturnType<typeof createAdminClient>,
  mediaUrl: string
): Promise<{ valid: boolean; detectedMime: string | null; error: string | null }> {
  try {
    const { data, error } = await admin.storage
      .from('desk-media')
      .download(mediaUrl)

    if (error || !data) {
      return {
        valid: false,
        detectedMime: null,
        error: error?.message ?? 'download_failed',
      }
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    if (buffer.byteLength === 0) {
      return {
        valid: false,
        detectedMime: null,
        error: 'empty_body',
      }
    }

    const detectedMime = sniffMimeFromBuffer(buffer, 'application/octet-stream')
    if (!isImageMime(detectedMime)) {
      return {
        valid: false,
        detectedMime,
        error: 'invalid_image_bytes',
      }
    }

    return {
      valid: true,
      detectedMime,
      error: null,
    }
  } catch (error) {
    return {
      valid: false,
      detectedMime: null,
      error: error instanceof Error ? error.message : 'download_failed',
    }
  }
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
        .select('id, content_type, evolution_message_id, media_url, media_mime_type, sender_type, from_who')
        .eq('id', dbMsgId)
        .maybeSingle()
    : admin
        .from('messages')
        .select('id, content_type, evolution_message_id, media_url, media_mime_type, sender_type, from_who')
        .eq('evolution_message_id', msgId!)
        .maybeSingle()

  const { data: messageRow } = await messageQuery
  const message = (messageRow ?? null) as MediaMessageRow | null
  let forceStorageRepair = false

  if (dbMsgId) {
    if (!message) {
      logMediaEvent('db_msg_missing', {
        conversationId,
        dbMsgId,
      })
      return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
    }
  }

  if (message?.media_url) {
    if (message.sender_type === 'contact' && message.content_type === 'image') {
      const validation = await validateStoredImageObject(admin, message.media_url)
      if (!validation.valid) {
        forceStorageRepair = true
        logMediaEvent('stored_image_invalid', {
          conversationId,
          msgId: message.evolution_message_id ?? msgId ?? dbMsgId,
          mediaUrl: message.media_url,
          senderType: message.sender_type,
          fromWho: message.from_who,
          detectedMime: validation.detectedMime,
          error: validation.error,
        })
      }
    }

    if (!forceStorageRepair) {
      if (isAudioContent(message.content_type, message.media_mime_type)) {
        const { data: audioData, error: audioError } = await admin.storage
          .from('desk-media')
          .download(message.media_url)
        if (!audioError && audioData) {
          const buf = Buffer.from(await audioData.arrayBuffer())
          if (buf.length === 0) {
            logMediaEvent('audio_stored_empty', {
              conversationId,
              msgId: message.evolution_message_id ?? msgId ?? dbMsgId,
              storagePath: message.media_url,
            })
          } else {
            const contentType = resolveAudioContentType(
              message.media_mime_type ?? 'application/octet-stream',
              message.content_type,
              logMediaEvent,
              { conversationId, msgId: message.evolution_message_id ?? msgId ?? dbMsgId }
            )
            logMediaEvent('audio_stored_inline', {
              conversationId,
              msgId: message.evolution_message_id ?? msgId ?? dbMsgId,
              contentType,
              bytes: buf.length,
            })
            return serveAudioInline(buf, contentType, request)
          }
        }
        logMediaEvent('audio_storage_download_failed', {
          conversationId,
          msgId: message.evolution_message_id ?? msgId ?? dbMsgId,
          mediaUrl: message.media_url,
        })
        // storage falhou — continua para recovery via Evolution
      } else {
        const signedUrl = await createMediaSignedUrl(admin, message.media_url)
        if (signedUrl) {
          return NextResponse.redirect(signedUrl, { status: 302 })
        }

        logMediaEvent('signed_url_failed', {
          conversationId,
          msgId: message.evolution_message_id ?? msgId ?? dbMsgId,
          mediaUrl: message.media_url,
          senderType: message.sender_type,
          fromWho: message.from_who,
        })
      }
    }
  } else if (dbMsgId && message) {
    logMediaEvent('db_msg_without_media_url', {
      conversationId,
      dbMsgId,
      evolutionMessageId: message.evolution_message_id,
      senderType: message.sender_type,
      fromWho: message.from_who,
      mimetype: message.media_mime_type,
    })
  } else {
    logMediaEvent('storage_missing_for_msg_id', {
      conversationId,
      msgId,
      hasMessageRow: Boolean(message),
    })
  }

  const targetMsgId = message?.evolution_message_id ?? msgId
  if (!targetMsgId) {
    return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
  }

  const contact = extractFirstContact(conv)
  const instanceName = extractEvolutionInstanceName(conv)
  if (!instanceName) {
    logMediaEvent('instance_missing', {
      conversationId,
      msgId: targetMsgId,
    })
    return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
  }

  const remoteJid = contact?.identifier ?? (contact?.phone_number ? `${contact.phone_number}@s.whatsapp.net` : null)
  if (!remoteJid) {
    logMediaEvent('remote_jid_missing', {
      conversationId,
      msgId: targetMsgId,
      hasIdentifier: Boolean(contact?.identifier),
      hasPhone: Boolean(contact?.phone_number),
    })
    return new NextResponse('M\u00eddia n\u00e3o dispon\u00edvel', { status: 404 })
  }

  const uploadOptions: { fromMe: boolean; upsert?: boolean } = {
    fromMe: Boolean(message && message.sender_type !== 'contact'),
  }
  if (forceStorageRepair) {
    uploadOptions.upsert = true
  }

  const recovered = await uploadMediaToStorage(
    instanceName,
    remoteJid,
    targetMsgId,
    conv.client_id,
    conversationId,
    message?.media_mime_type ?? 'application/octet-stream',
    null,
    (event, payload) => logMediaEvent(event, {
      conversationId,
      msgId: targetMsgId,
      ...payload,
    }),
    uploadOptions
  )

  if (!recovered.buffer || recovered.buffer.length === 0) {
    logMediaEvent('media_recovered_empty', {
      conversationId,
      msgId: targetMsgId,
      hasBuffer: Boolean(recovered.buffer),
      byteLength: recovered.buffer?.length ?? 0,
      source: recovered.source,
    })
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
        msgId: targetMsgId,
        messageId: message.id,
        storagePath: recovered.storagePath,
        error: updateError.message,
      })
    } else {
      logMediaEvent('media_backfill_succeeded', {
        conversationId,
        msgId: targetMsgId,
        messageId: message.id,
        storagePath: recovered.storagePath,
        source: recovered.source,
      })

      // Audio must always be served inline so the browser receives the exact
      // Content-Type (including codec hints). Signed-URL redirects let Supabase
      // serve the stored Content-Type which may lose the codec parameter.
      if (isAudioContent(message.content_type, message.media_mime_type ?? recovered.resolvedMime)) {
        const audioContentType = resolveAudioContentType(
          recovered.resolvedMime,
          message.content_type,
          logMediaEvent,
          { conversationId, msgId: targetMsgId }
        )
        logMediaEvent('audio_backfill_inline', {
          conversationId,
          msgId: targetMsgId,
          messageId: message.id,
          storagePath: recovered.storagePath,
          resolvedMime: recovered.resolvedMime,
          contentType: audioContentType,
          source: recovered.source,
        })
        return serveAudioInline(recovered.buffer, audioContentType, request)
      }

      const signedUrl = await createMediaSignedUrl(admin, recovered.storagePath)
      if (signedUrl) {
        return NextResponse.redirect(signedUrl, { status: 302 })
      }

      logMediaEvent('media_backfill_failed', {
        conversationId,
        msgId: targetMsgId,
        messageId: message.id,
        storagePath: recovered.storagePath,
        error: 'signed_url_failed_after_backfill',
      })
    }
  } else {
    logMediaEvent('audio_backfill_no_storagepath', {
      conversationId,
      msgId: targetMsgId,
      hasMessageRow: Boolean(message?.id),
      storagePath: recovered.storagePath,
      error: recovered.storagePath ? 'message_row_missing' : 'storage_path_missing',
    })
  }

  const fallbackContentType = isAudioContent(message?.content_type, recovered.resolvedMime)
    ? resolveAudioContentType(
        recovered.resolvedMime,
        message?.content_type,
        logMediaEvent,
        { conversationId, msgId: targetMsgId }
      )
    : recovered.resolvedMime

  logMediaEvent('media_inline_served', {
    conversationId,
    msgId: targetMsgId,
    messageId: message?.id ?? null,
    storagePath: recovered.storagePath,
    resolvedMime: recovered.resolvedMime,
    contentType: fallbackContentType,
    source: recovered.source,
    reason: recovered.storagePath ? 'signed_url_failed_after_backfill' : 'storage_unavailable_after_recovery',
  })

  if (isAudioContent(message?.content_type, fallbackContentType)) {
    return serveAudioInline(recovered.buffer, fallbackContentType, request)
  }

  return new NextResponse(new Uint8Array(recovered.buffer), {
    status: 200,
    headers: {
      'Content-Type': fallbackContentType,
      'Content-Length': String(recovered.buffer.length),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
