// GET /api/desk/media?msg_id=&conversation_id=&client_id=
// Serve mídia de uma mensagem: primeiro tenta o Supabase Storage (signed URL),
// se não houver media_url salva faz fallback para a Evolution API.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'
import { extractEvolutionInstanceName, extractFirstContact } from '@/lib/desk/conversation-row'

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return new NextResponse('Não autenticado', { status: 401 })

  // msg_id  = evolution_message_id (mensagens recebidas/antigas)
  // db_msg_id = messages.id UUID (mensagens enviadas pelo operador com media_url)
  const msgId = request.nextUrl.searchParams.get('msg_id')
  const dbMsgId = request.nextUrl.searchParams.get('db_msg_id')
  const conversationId = request.nextUrl.searchParams.get('conversation_id')
  if ((!msgId && !dbMsgId) || !conversationId) return new NextResponse('Parâmetros inválidos', { status: 400 })

  const admin = createAdminClient()

  // Verifica acesso à conversa
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

  // Tenta buscar media_url do Storage primeiro
  // — por db_msg_id (mensagens enviadas pelo operador) ou por evolution_message_id (recebidas)
  const mediaQuery = dbMsgId
    ? admin.from('messages').select('media_url').eq('id', dbMsgId).maybeSingle()
    : admin.from('messages').select('media_url').eq('evolution_message_id', msgId!).maybeSingle()

  const { data: msgRow } = await mediaQuery

  if (msgRow?.media_url) {
    const { data: signedData, error } = await admin.storage
      .from('desk-media')
      .createSignedUrl(msgRow.media_url, 3600)

    if (!error && signedData?.signedUrl) {
      return NextResponse.redirect(signedData.signedUrl, { status: 302 })
    }
    // Signed URL falhou — tenta Evolution como fallback (só faz sentido para msg_id)
  }

  // Se veio por db_msg_id e não tem media_url (ou signed URL falhou), não tem fallback Evolution
  if (dbMsgId && !msgId) {
    return new NextResponse('Mídia não disponível', { status: 404 })
  }

  // Fallback: busca base64 diretamente da Evolution API
  const contact = extractFirstContact(conv)
  const instanceName = extractEvolutionInstanceName(conv)

  if (!instanceName) return new NextResponse('Instância não configurada', { status: 422 })

  const remoteJid = contact?.identifier ?? (contact?.phone_number ? `${contact.phone_number}@s.whatsapp.net` : null)
  if (!remoteJid) return new NextResponse('Contato sem identificador', { status: 422 })

  const evolutionUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY
  if (!evolutionUrl || !evolutionKey) return new NextResponse('Evolution não configurada', { status: 500 })

  try {
    const res = await fetch(`${evolutionUrl}/message/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({ message: { key: { remoteJid, fromMe: false, id: msgId } } }),
    })

    if (!res.ok) {
      console.error(`[desk/media] Evolution error ${res.status} for msg=${msgId}`)
      return new NextResponse('Mídia não disponível', { status: 404 })
    }

    const data = await res.json()
    const base64 = data.base64 as string | undefined
    const mimetype = (data.mimetype as string | undefined) ?? 'image/jpeg'

    if (!base64) return new NextResponse('Base64 não retornado pela Evolution', { status: 404 })

    const buffer = Buffer.from(base64, 'base64')
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimetype,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[desk/media] Erro ao buscar mídia:', err)
    return new NextResponse('Erro interno', { status: 500 })
  }
}
