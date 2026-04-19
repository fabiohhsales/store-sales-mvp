import OpenAI, { toFile } from 'openai'
import { AI_MODEL_MINI } from '@/lib/ai/client'
import { convertAudioForTranscription } from '@/lib/media/audio-conversion'
import type { BotMessage } from '@/types/bot'

export const OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'

export type MultimodalDerivedKind = 'transcription' | 'vision_analysis'
export type MultimodalProcessingStatus = 'not_required' | 'received' | 'downloaded' | 'processed' | 'failed'

export interface MultimodalProcessingResult {
  provider: 'openai' | null
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

function resolveOpenAiTranscriptionModel(): string {
  return trimText(process.env.OPENAI_TRANSCRIPTION_MODEL) ?? OPENAI_TRANSCRIPTION_MODEL
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

async function sendToWhisper(
  buffer: Buffer,
  mime: string,
  client: OpenAI,
  model: string,
  rawMime: string
): Promise<MultimodalProcessingResult> {
  try {
    const ext = mime.split('/')[1] ?? 'wav'
    logMultimodalEvent('transcription_format_sent', {
      provider: 'openai',
      model,
      mime,
      rawMime,
    })
    const file = await toFile(buffer, `audio.${ext}`, { type: mime })
    const result = await client.audio.transcriptions.create({ file, model, language: 'pt' })
    const transcript = trimText(result.text)

    if (!transcript) {
      return {
        provider: 'openai',
        derivedText: null,
        derivedKind: null,
        aiInputText: null,
        mediaTranscript: null,
        processingStatus: 'failed',
        processingError: 'transcription_empty',
      }
    }

    return {
      provider: 'openai',
      derivedText: transcript,
      derivedKind: 'transcription',
      aiInputText: buildAiInputText('audio', '[Áudio]', transcript),
      mediaTranscript: transcript,
      processingStatus: 'processed',
      processingError: null,
    }
  } catch (e: unknown) {
    const errorMsg = String(e)
    logMultimodalEvent('transcription_error', {
      error: errorMsg,
      mime,
      provider: 'openai',
      model,
      rawMime,
    }, 'warn')
    return {
      provider: 'openai',
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'transcription_processing_failed',
    }
  }
}

async function transcribeAudio(buffer: Buffer, rawMime: string): Promise<MultimodalProcessingResult> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
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

  logMultimodalEvent('audio_conversion_started', { rawMime })
  const t0 = Date.now()
  const wavBuffer = await convertAudioForTranscription(buffer, rawMime)

  if (!wavBuffer) {
    logMultimodalEvent('audio_conversion_failed', { rawMime, durationMs: Date.now() - t0 }, 'warn')
    return {
      provider: 'openai',
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'transcription_processing_failed',
    }
  }

  logMultimodalEvent('audio_conversion_succeeded', {
    rawMime,
    wavBytes: wavBuffer.length,
    durationMs: Date.now() - t0,
  })

  const client = new OpenAI({ apiKey })
  return sendToWhisper(
    wavBuffer,
    'audio/wav',
    client,
    resolveOpenAiTranscriptionModel(),
    rawMime
  )
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
    const cleanMime = resolvedMime.split(';')[0].trim()
    const dataUrl = `data:${cleanMime};base64,${buffer.toString('base64')}`
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
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    logMultimodalEvent('vision_error', {
      error: errorMsg,
      mime: resolvedMime,
      provider: 'openai',
    }, 'warn')
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
