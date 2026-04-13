// GET /api/desk/media?msg_id=&conversation_id=&client_id=
// Resolve mídia pelo Storage e, para mensagens inbound, tenta fallback na Evolution.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'

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
  if (!deskUser) return new NextResponse('Não autenticado', { status: 401 })

  const msgId = request.nextUrl.searchParams.get('msg_id')
  const dbMsgId = request.nextUrl.searchParams.get('db_msg_id')
  const conversationId = request.nextUrl.searchParams.get('conversation_id')
  if ((!msgId && !dbMsgId) || !conversationId) {
    return new NextResponse('Parâmetros inválidos', { status: 400 })
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

  if (!conv) return new NextResponse('Conversa não encontrada', { status: 404 })
  if (!deskUser.isAdmin && conv.client_id !== deskUser.clientId) {
    return new NextResponse('Acesso negado', { status: 403 })
  }

  const messageQuery = dbMsgId
    ? admin.from('messages').select('id, evolution_message_id, media_url, media_mime_type, sender_type, from_who').eq('id', dbMsgId).maybeSingle()
    : admin.from('messages').select('id, evolution_message_id, media_url, media_mime_type, sender_type, from_who').eq('evolution_message_id', msgId!).maybeSingle()

  const { data: messageRow } = await messageQuery
  const message = (messageRow ?? null) as MediaMessageRow | null

  if (dbMsgId) {
    if (!message) {
      logMediaEvent('db_msg_missing', {
        conversationId,
        dbMsgId,
      })
      return new NextResponse('Mídia não disponível', { status: 404 })
    }

    if (!message.media_url) {
      logMediaEvent('db_msg_without_media_url', {
        conversationId,
        dbMsgId,
        senderType: message.sender_type,
        fromWho: message.from_who,
        mimetype: message.media_mime_type,
      })
      return new NextResponse('Mídia não disponível', { status: 404 })
    }

    const signedUrl = await createMediaSignedUrl(admin, message.media_url)
    if (!signedUrl) {
      logMediaEvent('signed_url_failed', {
        conversationId,
        dbMsgId,
        mediaUrl: message.media_url,
        senderType: message.sender_type,
      })
      return new NextResponse('Mídia não disponível', { status: 404 })
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
    return new NextResponse('Mídia não disponível', { status: 404 })
  }

  const remoteJid = contact?.identifier ?? (contact?.phone_number ? `${contact.phone_number}@s.whatsapp.net` : null)
  if (!remoteJid) {
    logMediaEvent('remote_jid_missing', {
      conversationId,
      msgId,
      hasIdentifier: Boolean(contact?.identifier),
      hasPhone: Boolean(contact?.phone_number),
    })
    return new NextResponse('Mídia não disponível', { status: 404 })
  }

  const evolutionUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY
  if (!evolutionUrl || !evolutionKey) {
    logMediaEvent('evolution_not_configured', {
      conversationId,
      msgId,
      hasUrl: Boolean(evolutionUrl),
      hasKey: Boolean(evolutionKey),
    })
    return new NextResponse('Mídia não disponível', { status: 404 })
  }

  try {
    const res = await fetch(`${evolutionUrl}/message/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({ message: { key: { remoteJid, fromMe: false, id: msgId } } }),
    })

    if (!res.ok) {
      logMediaEvent('evolution_media_fetch_failed', {
        conversationId,
        msgId,
        status: res.status,
        instanceName,
        remoteJid,
      })
      return new NextResponse('Mídia não disponível', { status: 404 })
    }

    const data = await res.json()
    const base64 = data.base64 as string | undefined
    const mimetype = (data.mimetype as string | undefined) ?? 'image/jpeg'

    if (!base64) {
      logMediaEvent('evolution_media_without_base64', {
        conversationId,
        msgId,
        instanceName,
      })
      return new NextResponse('Mídia não disponível', { status: 404 })
    }

    const buffer = Buffer.from(base64, 'base64')
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimetype,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    logMediaEvent('evolution_media_exception', {
      conversationId,
      msgId,
      error: error instanceof Error ? error.message : 'unknown_error',
    })
    return new NextResponse('Mídia não disponível', { status: 404 })
  }
}
