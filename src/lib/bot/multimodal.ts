import OpenAI, { toFile } from 'openai'
import { AI_MODEL_MINI } from '@/lib/ai/client'
import {
  audioMimeToExtension,
  convertAudioForTranscription,
  normalizeAudioMime,
} from '@/lib/media/audio-conversion'
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

const OPENAI_RAW_AUDIO_FALLBACK_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/oga',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
])

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
  rawMime: string,
  filename?: string
): Promise<MultimodalProcessingResult> {
  try {
    const ext = audioMimeToExtension(mime)
    logMultimodalEvent('transcription_format_sent', {
      provider: 'openai',
      model,
      mime,
      rawMime,
    })
    const file = await toFile(buffer, filename ?? `audio.${ext}`, { type: mime })
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
      processingError: 'transcription_provider_failed',
    }
  }
}

async function transcribeAudio(
  buffer: Buffer,
  rawMime: string,
  oggTruncated: boolean
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
      processingError: 'transcription_provider_unavailable',
    }
  }

  // Buffer OGG/Opus sinalizado como truncado pela media-storage: ffmpeg vai
  // falhar com "End of file" e o endpoint bruto da OpenAI rejeita OGG parcial.
  // Pular cedo, com razão específica, preserva logs e evita gastar quota.
  if (oggTruncated) {
    logMultimodalEvent('audio_transcription_skipped', {
      rawMime,
      reason: 'audio_source_truncated',
      inputBytes: buffer.length,
    }, 'warn')
    return {
      provider: null,
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'audio_source_truncated',
    }
  }

  logMultimodalEvent('audio_conversion_started', { rawMime })
  const t0 = Date.now()
  const client = new OpenAI({ apiKey })
  const model = resolveOpenAiTranscriptionModel()
  const conversion = await convertAudioForTranscription(buffer, rawMime)

  if (conversion.ok) {
    logMultimodalEvent('audio_conversion_succeeded', {
      rawMime,
      wavBytes: conversion.buffer.length,
      durationMs: Date.now() - t0,
      binaryPath: conversion.binaryPath,
      binarySource: conversion.binarySource,
      exitCode: conversion.exitCode,
      signal: conversion.signal,
      stderrPreview: conversion.stderrPreview,
    })

    return sendToWhisper(
      conversion.buffer,
      'audio/wav',
      client,
      model,
      rawMime,
      'audio.wav'
    )
  }

  logMultimodalEvent('audio_conversion_failed', {
    rawMime,
    durationMs: Date.now() - t0,
    failureReason: conversion.failureReason,
    binaryPath: conversion.binaryPath,
    binarySource: conversion.binarySource,
    exitCode: conversion.exitCode,
    signal: conversion.signal,
    stderrPreview: conversion.stderrPreview,
    inputBytes: conversion.inputBytes,
    outputBytes: conversion.outputBytes,
  }, 'warn')

  const normalizedRawMime = normalizeAudioMime(rawMime)
  if (!OPENAI_RAW_AUDIO_FALLBACK_MIME_TYPES.has(normalizedRawMime)) {
    logMultimodalEvent('audio_transcription_fallback_skipped', {
      rawMime,
      normalizedRawMime,
      reason: 'unsupported_mime',
      conversionFailureReason: conversion.failureReason,
    }, 'warn')
    return {
      provider: 'openai',
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: conversion.failureReason,
    }
  }

  logMultimodalEvent('audio_transcription_fallback_attempted', {
    rawMime,
    normalizedRawMime,
    conversionFailureReason: conversion.failureReason,
  })

  const rawResult = await sendToWhisper(
    buffer,
    normalizedRawMime,
    client,
    model,
    rawMime,
    `audio.${audioMimeToExtension(normalizedRawMime)}`
  )

  if (rawResult.processingStatus === 'processed') {
    logMultimodalEvent('audio_transcription_fallback_succeeded', {
      rawMime,
      normalizedRawMime,
      conversionFailureReason: conversion.failureReason,
    })
    return rawResult
  }

  logMultimodalEvent('audio_transcription_fallback_failed', {
    rawMime,
    normalizedRawMime,
    conversionFailureReason: conversion.failureReason,
    fallbackError: rawResult.processingError,
  }, 'warn')

  return rawResult
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
  oggTruncated?: boolean
}): Promise<MultimodalProcessingResult> {
  const { contentType, content, buffer, resolvedMime, oggTruncated } = args

  if (contentType === 'audio') {
    return transcribeAudio(buffer, resolvedMime, oggTruncated ?? false)
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
