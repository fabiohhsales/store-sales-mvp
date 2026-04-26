import { NextRequest, NextResponse } from 'next/server'
import { AI_MODEL_MINI, createAiClient } from '@/lib/ai/client'
import { resolveDeskUser } from '@/lib/desk/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CadenceType } from '@/types/followup'

type HistoryRow = {
  content: string | null
  content_type: string | null
  media_transcript: string | null
  from_who: string | null
  sender_type: string | null
  created_at: string
}

function isCadenceType(value: unknown): value is CadenceType {
  return value === 'lead' || value === 'atendimento' || value === 'agendado'
}

function formatHistory(rows: HistoryRow[]): string {
  return rows
    .slice()
    .reverse()
    .map((row) => {
      const speaker =
        row.from_who === 'lead'
          ? 'Paciente'
          : row.from_who === 'human' || row.sender_type === 'operator'
            ? 'Operador'
            : 'Assistente'
      const content =
        row.content_type === 'audio' && row.media_transcript
          ? `[Audio transcrito] ${row.media_transcript}`
          : row.content ?? ''

      return `${speaker}: ${content}`.trim()
    })
    .filter(Boolean)
    .join('\n')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const deskUser = await resolveDeskUser(request)
  if (!deskUser) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const { conversationId } = await params
  const body = await request.json().catch(() => ({}))
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : ''
  const cadenceType = body?.cadence_type

  if (!instruction) {
    return NextResponse.json({ error: 'instruction obrigatoria' }, { status: 400 })
  }

  if (!isCadenceType(cadenceType)) {
    return NextResponse.json({ error: 'cadence_type invalido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id, client_id, contacts(name, phone_number)')
    .eq('id', conversationId)
    .maybeSingle()

  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 })
  }

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
  }

  if (!deskUser.isAdmin && conversation.client_id !== deskUser.clientId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const [{ data: botConfig, error: botConfigError }, { data: history, error: historyError }] =
    await Promise.all([
      admin
        .from('panel_bot_config')
        .select(
          'professional_name, business_name, ai_tone, ai_language, ai_custom_instructions, process_flow_guide'
        )
        .eq('client_id', conversation.client_id)
        .maybeSingle(),
      admin
        .from('messages')
        .select('content, content_type, media_transcript, from_who, sender_type, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(12),
    ])

  if (botConfigError) {
    return NextResponse.json({ error: botConfigError.message }, { status: 500 })
  }

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 })
  }

  const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts
  const transcript = formatHistory((history ?? []) as HistoryRow[])

  const openai = createAiClient()
  const completion = await openai.chat.completions.create({
    model: AI_MODEL_MINI,
    temperature: 0.4,
    max_tokens: 220,
    messages: [
      {
        role: 'system',
        content: [
          'Voce escreve mensagens curtas de WhatsApp para follow-up operacional.',
          'Retorne apenas o texto final da mensagem, sem aspas e sem marcacao.',
          `Tom: ${botConfig?.ai_tone ?? 'professional_friendly'}.`,
          `Idioma: ${botConfig?.ai_language ?? 'pt-BR'}.`,
          `Profissional: ${botConfig?.professional_name ?? 'Equipe'}.`,
          `Negocio: ${botConfig?.business_name ?? botConfig?.professional_name ?? 'Clinica'}.`,
          botConfig?.ai_custom_instructions ? `Instrucoes extras: ${botConfig.ai_custom_instructions}` : '',
          botConfig?.process_flow_guide ? `Processo: ${botConfig.process_flow_guide}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      {
        role: 'user',
        content: [
          `Cadencia: ${cadenceType}`,
          `Contato: ${contact?.name ?? 'Paciente'} (${contact?.phone_number ?? 'sem telefone'})`,
          `Instrucao: ${instruction}`,
          'Historico recente:',
          transcript || 'Sem historico recente.',
        ].join('\n'),
      },
    ],
  })

  const message = completion.choices[0]?.message?.content?.trim()

  if (!message) {
    return NextResponse.json({ error: 'Nao foi possivel gerar a mensagem' }, { status: 502 })
  }

  return NextResponse.json({ message })
}
