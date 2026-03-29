// GET /api/desk/media?msg_id=&conversation_id=&client_id=
// Busca mídia (imagem) de uma mensagem via Evolution API e retorna como imagem.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDeskUser } from '@/lib/desk/auth'

export async function GET(request: NextRequest) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return new NextResponse('Não autenticado', { status: 401 })

  const msgId = request.nextUrl.searchParams.get('msg_id')
  const conversationId = request.nextUrl.searchParams.get('conversation_id')
  if (!msgId || !conversationId) return new NextResponse('Parâmetros inválidos', { status: 400 })

  const admin = createAdminClient()

  // Get the conversation to find the instance and contact
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

  const contact = conv.contacts as { identifier: string | null; phone_number: string | null } | null
  const instanceName = (conv as Record<string, unknown>)
    ?.panel_clients?.panel_whatsapp_config?.evolution_instance_name as string | null

  if (!instanceName) return new NextResponse('Instância não configurada', { status: 422 })

  const remoteJid = contact?.identifier ?? (contact?.phone_number ? `${contact.phone_number}@s.whatsapp.net` : null)
  if (!remoteJid) return new NextResponse('Contato sem identificador', { status: 422 })

  // Call Evolution API to get base64 media
  const evolutionUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY

  if (!evolutionUrl || !evolutionKey) return new NextResponse('Evolution não configurada', { status: 500 })

  try {
    const res = await fetch(`${evolutionUrl}/message/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey,
      },
      body: JSON.stringify({
        message: {
          key: {
            remoteJid,
            fromMe: false,
            id: msgId,
          }
        }
      }),
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
