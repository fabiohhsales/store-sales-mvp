import OpenAI, { toFile } from 'openai'
import { AI_MODEL_MINI } from '@/lib/ai/client'
import type { BotMessage } from '@/types/bot'

export type MultimodalDerivedKind = 'transcription' | 'vision_analysis'
export type MultimodalProcessingStatus = 'not_required' | 'received' | 'downloaded' | 'processed' | 'failed'

export interface MultimodalProcessingResult {
  provider: 'openai' | 'groq' | null
  derivedText: string | null
  derivedKind: MultimodalDerivedKind | null
  aiInputText: string | null
  mediaTranscript: string | null
  processingStatus: MultimodalProcessingStatus
  processingError: string | null
}

function trimText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function logMultimodalEvent(
  event: string,
  payload: Record<string, unknown>,
  level: 'log' | 'warn' = 'log'
): void {
  const logger = level === 'warn' ? console.warn : console.log
  logger(`[multimodal] ${event}`, payload)
}

export function buildAiInputText(
  contentType: string,
  content: string | null | undefined,
  derivedText: string | null | undefined
): string | null {
  const normalizedDerived = trimText(derivedText)
  const normalizedContent = trimText(content)

  if (contentType === 'audio') {
    return normalizedDerived ? `Transcrição do áudio do contato: ${normalizedDerived}` : null
  }

  if (contentType === 'image') {
    return normalizedDerived ? `Descrição da imagem enviada pelo contato: ${normalizedDerived}` : null
  }

  return normalizedContent
}

export function resolveAgentInputText(
  message: Pick<BotMessage, 'content_type' | 'content' | 'ai_input_text' | 'derived_text' | 'media_transcript'>
): string | null {
  const canonical = trimText(message.ai_input_text)
  if (canonical) return canonical

  const derived = trimText(message.derived_text)
  if (derived) {
    return buildAiInputText(message.content_type, message.content, derived)
  }

  if (message.content_type === 'audio' && trimText(message.media_transcript)) {
    return buildAiInputText('audio', message.content, message.media_transcript)
  }

  return buildAiInputText(message.content_type, message.content, null)
}

async function transcribeAudio(buffer: Buffer, resolvedMime: string): Promise<MultimodalProcessingResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const groqKey = process.env.GROQ_API_KEY

  if (!apiKey && !groqKey) {
    return {
      provider: null,
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'transcription_provider_unavailable',
    }
  }

  try {
    const provider = apiKey ? 'openai' : 'groq'
    const client = apiKey
      ? new OpenAI({ apiKey })
      : new OpenAI({ apiKey: groqKey!, baseURL: 'https://api.groq.com/openai/v1' })
    const model = apiKey ? 'whisper-1' : 'whisper-large-v3'
    const ext = resolvedMime.split('/')[1]?.split(';')[0] ?? 'ogg'
    const file = await toFile(buffer, `audio.${ext}`, { type: resolvedMime })
    const result = await client.audio.transcriptions.create({ file, model, language: 'pt' })
    const transcript = trimText(result.text)

    if (!transcript) {
      return {
        provider,
        derivedText: null,
        derivedKind: null,
        aiInputText: null,
        mediaTranscript: null,
        processingStatus: 'failed',
        processingError: 'transcription_empty',
      }
    }

    return {
      provider,
      derivedText: transcript,
      derivedKind: 'transcription',
      aiInputText: buildAiInputText('audio', '[Áudio]', transcript),
      mediaTranscript: transcript,
      processingStatus: 'processed',
      processingError: null,
    }
  } catch {
    return {
      provider: apiKey ? 'openai' : 'groq',
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'transcription_processing_failed',
    }
  }
}

async function analyzeImage(
  buffer: Buffer,
  resolvedMime: string,
  content: string | null
): Promise<MultimodalProcessingResult> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return {
      provider: null,
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'vision_provider_unavailable',
    }
  }

  try {
    const client = new OpenAI({ apiKey })
    const dataUrl = `data:${resolvedMime};base64,${buffer.toString('base64')}`
    const caption = trimText(content)
    const captionContext = caption && caption !== '[Imagem]'
      ? `Contexto adicional enviado com a imagem: ${caption}.`
      : 'A imagem pode não ter legenda.'

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL ?? AI_MODEL_MINI,
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'Descreva em pt-BR, de forma objetiva, o que e visivel na imagem enviada pelo contato. ' +
            'Se houver texto legivel, inclua-o. Nao invente informacoes clinicas nem conclusoes nao visiveis.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: captionContext },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    })

    const description = trimText(response.choices[0]?.message?.content)
    if (!description) {
      return {
        provider: 'openai',
        derivedText: null,
        derivedKind: null,
        aiInputText: null,
        mediaTranscript: null,
        processingStatus: 'failed',
        processingError: 'vision_empty',
      }
    }

    return {
      provider: 'openai',
      derivedText: description,
      derivedKind: 'vision_analysis',
      aiInputText: buildAiInputText('image', content, description),
      mediaTranscript: null,
      processingStatus: 'processed',
      processingError: null,
    }
  } catch {
    return {
      provider: 'openai',
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'vision_processing_failed',
    }
  }
}

export async function processDownloadedMultimodalMessage(args: {
  contentType: BotMessage['content_type']
  content: string | null
  buffer: Buffer
  resolvedMime: string
}): Promise<MultimodalProcessingResult> {
  const { contentType, content, buffer, resolvedMime } = args

  if (contentType === 'audio') {
    return transcribeAudio(buffer, resolvedMime)
  }

  if (contentType === 'image') {
    return analyzeImage(buffer, resolvedMime, content)
  }

  return {
    provider: null,
    derivedText: null,
    derivedKind: null,
    aiInputText: buildAiInputText(contentType, content, null),
    mediaTranscript: null,
    processingStatus: 'not_required',
    processingError: null,
  }
}
