import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transcriptionsCreate: vi.fn(),
  completionsCreate: vi.fn(),
  toFile: vi.fn(),
}))

vi.mock('openai', () => {
  class OpenAI {
    audio = {
      transcriptions: {
        create: mocks.transcriptionsCreate,
      },
    }

    chat = {
      completions: {
        create: mocks.completionsCreate,
      },
    }

    constructor(options: Record<string, unknown>) {
      void options
    }
  }

  return {
    default: OpenAI,
    toFile: mocks.toFile,
  }
})

import {
  buildAiInputText,
  processDownloadedMultimodalMessage,
  resolveAgentInputText,
} from '@/lib/bot/multimodal'

describe('multimodal helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.toFile.mockResolvedValue({ name: 'audio.ogg' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds canonical ai_input_text for audio, image and text', () => {
    expect(buildAiInputText('audio', '[Áudio]', 'Quero marcar para amanhã')).toBe(
      'Transcrição do áudio do contato: Quero marcar para amanhã'
    )
    expect(buildAiInputText('image', '[Imagem]', 'Exame impresso com pressão 12x8')).toBe(
      'Descrição da imagem enviada pelo contato: Exame impresso com pressão 12x8'
    )
    expect(buildAiInputText('text', 'Olá', null)).toBe('Olá')
  })

  it('prioritizes ai_input_text, then derived_text, and keeps legacy audio transcript fallback', () => {
    expect(resolveAgentInputText({
      content_type: 'image',
      content: '[Imagem]',
      ai_input_text: 'Descrição da imagem enviada pelo contato: radiografia do joelho',
      derived_text: null,
      media_transcript: null,
    })).toBe('Descrição da imagem enviada pelo contato: radiografia do joelho')

    expect(resolveAgentInputText({
      content_type: 'image',
      content: '[Imagem]',
      ai_input_text: null,
      derived_text: 'Print com exame e texto legível',
      media_transcript: null,
    })).toBe('Descrição da imagem enviada pelo contato: Print com exame e texto legível')

    expect(resolveAgentInputText({
      content_type: 'audio',
      content: '[Áudio]',
      ai_input_text: null,
      derived_text: 'Paciente quer remarcar para amanhã cedo',
      media_transcript: null,
    })).toBe('Transcrição do áudio do contato: Paciente quer remarcar para amanhã cedo')

    expect(resolveAgentInputText({
      content_type: 'audio',
      content: '[Áudio]',
      ai_input_text: null,
      derived_text: null,
      media_transcript: 'Paciente quer remarcar a consulta',
    })).toBe('Transcrição do áudio do contato: Paciente quer remarcar a consulta')
  })

  it('uses Groq (native OGG support) when available for audio/ogg', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Quero marcar para amanhã' })

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    expect(mocks.toFile).toHaveBeenCalledTimes(1)
    expect(mocks.toFile).toHaveBeenCalledWith(expect.anything(), 'audio.ogg', { type: 'audio/ogg' })
    expect(result).toMatchObject({
      provider: 'groq',
      derivedKind: 'transcription',
      derivedText: 'Quero marcar para amanhã',
      aiInputText: 'Transcrição do áudio do contato: Quero marcar para amanhã',
      mediaTranscript: 'Quero marcar para amanhã',
      processingStatus: 'processed',
      processingError: null,
    })
  })

  it('sends audio/ogg directly to OpenAI (no webm relabeling) when only OpenAI is available', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Quero marcar para amanhã' })

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    // Should send audio/ogg directly — no more webm relabeling
    expect(mocks.toFile).toHaveBeenCalledWith(expect.anything(), 'audio.ogg', { type: 'audio/ogg' })
    expect(result).toMatchObject({
      provider: 'openai',
      derivedKind: 'transcription',
      processingStatus: 'processed',
    })
  })

  it('falls back to OpenAI ogg when Groq OGG returns a format error', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')

    const formatError = Object.assign(new Error('400 Invalid file format'), { status: 400 })
    mocks.transcriptionsCreate
      .mockRejectedValueOnce(formatError)
      .mockResolvedValueOnce({ text: 'Transcrição via fallback OpenAI' })

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    // Primary WAV path fails (no ffmpeg in test env), falls back:
    // attempt 1 = Groq with audio/ogg → 400 format error → try next
    // attempt 2 = OpenAI with audio/ogg (no longer webm relabeling) → success
    expect(mocks.toFile).toHaveBeenCalledTimes(2)
    expect(mocks.toFile).toHaveBeenNthCalledWith(1, expect.anything(), 'audio.ogg', { type: 'audio/ogg' })
    expect(mocks.toFile).toHaveBeenNthCalledWith(2, expect.anything(), 'audio.ogg', { type: 'audio/ogg' })
    expect(result).toMatchObject({
      provider: 'openai',
      processingStatus: 'processed',
      derivedText: 'Transcrição via fallback OpenAI',
    })
  })

  it('marks processing failed when all transcription attempts fail', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    const formatError = Object.assign(new Error('BadRequestError [400]: Invalid file format'), { status: 400 })
    mocks.transcriptionsCreate.mockRejectedValue(formatError)

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    expect(result).toMatchObject({
      processingStatus: 'failed',
      processingError: 'transcription_processing_failed',
    })
  })

  it('processes image analysis only with OpenAI and fails clearly without it', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    mocks.completionsCreate.mockResolvedValue({
      choices: [{ message: { content: 'Print com resultados do exame e texto legível.' } }],
    })

    const success = await processDownloadedMultimodalMessage({
      contentType: 'image',
      content: '[Imagem]',
      buffer: Buffer.from('image-binary'),
      resolvedMime: 'image/jpeg',
    })

    expect(success).toMatchObject({
      provider: 'openai',
      derivedKind: 'vision_analysis',
      derivedText: 'Print com resultados do exame e texto legível.',
      aiInputText: 'Descrição da imagem enviada pelo contato: Print com resultados do exame e texto legível.',
      processingStatus: 'processed',
      processingError: null,
    })

    vi.unstubAllEnvs()
    vi.stubEnv('GROQ_API_KEY', 'groq-only')

    const failure = await processDownloadedMultimodalMessage({
      contentType: 'image',
      content: '[Imagem]',
      buffer: Buffer.from('image-binary'),
      resolvedMime: 'image/jpeg',
    })

    expect(failure).toMatchObject({
      provider: null,
      derivedText: null,
      aiInputText: null,
      processingStatus: 'failed',
      processingError: 'vision_provider_unavailable',
    })
  })
})
