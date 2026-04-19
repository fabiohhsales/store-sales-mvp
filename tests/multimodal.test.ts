import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transcriptionsCreate: vi.fn(),
  completionsCreate: vi.fn(),
  toFile: vi.fn(),
  convertAudioForTranscription: vi.fn(),
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

vi.mock('@/lib/media/audio-conversion', () => ({
  convertAudioForTranscription: mocks.convertAudioForTranscription,
}))

import {
  buildAiInputText,
  processDownloadedMultimodalMessage,
  resolveAgentInputText,
} from '@/lib/bot/multimodal'

describe('multimodal helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.toFile.mockResolvedValue({ name: 'audio.wav' })
    mocks.convertAudioForTranscription.mockResolvedValue(null)
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

  it('converts inbound ogg to wav and sends it to OpenAI mini transcribe by default', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    const wavBuffer = Buffer.from('wav-binary')
    mocks.convertAudioForTranscription.mockResolvedValue(wavBuffer)
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Quero marcar para amanhã' })

    const inputBuffer = Buffer.from('audio-binary')
    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: inputBuffer,
      resolvedMime: 'audio/ogg',
    })

    expect(mocks.convertAudioForTranscription).toHaveBeenCalledWith(inputBuffer, 'audio/ogg')
    expect(mocks.toFile).toHaveBeenCalledTimes(1)
    expect(mocks.toFile).toHaveBeenCalledWith(wavBuffer, 'audio.wav', { type: 'audio/wav' })
    expect(mocks.transcriptionsCreate).toHaveBeenCalledWith({
      file: { name: 'audio.wav' },
      model: 'gpt-4o-mini-transcribe',
      language: 'pt',
    })
    expect(result).toMatchObject({
      provider: 'openai',
      derivedKind: 'transcription',
      derivedText: 'Quero marcar para amanhã',
      aiInputText: 'Transcrição do áudio do contato: Quero marcar para amanhã',
      mediaTranscript: 'Quero marcar para amanhã',
      processingStatus: 'processed',
      processingError: null,
    })
  })

  it('uses OPENAI_TRANSCRIPTION_MODEL override when provided', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    vi.stubEnv('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-transcribe')
    mocks.convertAudioForTranscription.mockResolvedValue(Buffer.from('wav-binary'))
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Quero marcar para amanhã' })

    await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    expect(mocks.transcriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-transcribe',
    }))
  })

  it('returns transcription_provider_unavailable without OpenAI even if Groq is configured', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key')

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    expect(mocks.convertAudioForTranscription).not.toHaveBeenCalled()
    expect(mocks.transcriptionsCreate).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: null,
      processingStatus: 'failed',
      processingError: 'transcription_provider_unavailable',
    })
  })

  it('marks processing failed when wav conversion fails before calling OpenAI', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    mocks.convertAudioForTranscription.mockResolvedValue(null)

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Áudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
    })

    expect(result).toMatchObject({
      provider: 'openai',
      processingStatus: 'failed',
      processingError: 'transcription_processing_failed',
    })
    expect(mocks.transcriptionsCreate).not.toHaveBeenCalled()
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
