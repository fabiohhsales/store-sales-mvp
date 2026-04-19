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
  audioMimeToExtension: (mime: string) => {
    const normalized = mime.split(';')[0].trim().toLowerCase()
    if (normalized === 'audio/ogg') return 'ogg'
    if (normalized === 'audio/webm') return 'webm'
    if (normalized === 'audio/wav') return 'wav'
    return 'bin'
  },
  normalizeAudioMime: (mime: string) => mime.split(';')[0].trim().toLowerCase(),
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
    mocks.convertAudioForTranscription.mockResolvedValue({
      ok: false,
      buffer: null,
      failureReason: 'audio_conversion_nonzero_exit',
      binaryPath: '/opt/ffmpeg-static/ffmpeg',
      binarySource: 'ffmpeg-static',
      platform: 'linux',
      arch: 'x64',
      exitCode: 1,
      signal: null,
      stderrFull: 'ffmpeg failed',
      stderrPreview: 'ffmpeg failed',
      inputBytes: 12,
      outputBytes: null,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds canonical ai_input_text for audio, image and text', () => {
    expect(buildAiInputText('audio', '[Ãudio]', 'Quero marcar para amanhÃ£')).toMatch(/^Transcri/)
    expect(buildAiInputText('audio', '[Ãudio]', 'Quero marcar para amanhÃ£')).toContain('Quero marcar para amanhÃ£')
    expect(buildAiInputText('image', '[Imagem]', 'Exame impresso com pressÃ£o 12x8')).toMatch(/^Descri/)
    expect(buildAiInputText('image', '[Imagem]', 'Exame impresso com pressÃ£o 12x8')).toContain('Exame impresso com pressÃ£o 12x8')
    expect(buildAiInputText('text', 'OlÃ¡', null)).toBe('OlÃ¡')
  })

  it('prioritizes ai_input_text, then derived_text, and keeps legacy audio transcript fallback', () => {
    expect(resolveAgentInputText({
      content_type: 'image',
      content: '[Imagem]',
      ai_input_text: 'DescriÃ§Ã£o da imagem enviada pelo contato: radiografia do joelho',
      derived_text: null,
      media_transcript: null,
    })).toContain('radiografia do joelho')

    expect(resolveAgentInputText({
      content_type: 'image',
      content: '[Imagem]',
      ai_input_text: null,
      derived_text: 'Print com exame e texto legÃ­vel',
      media_transcript: null,
    })).toContain('Print com exame e texto legÃ­vel')

    expect(resolveAgentInputText({
      content_type: 'audio',
      content: '[Ãudio]',
      ai_input_text: null,
      derived_text: 'Paciente quer remarcar para amanhÃ£ cedo',
      media_transcript: null,
    })).toContain('Paciente quer remarcar para amanhÃ£ cedo')

    expect(resolveAgentInputText({
      content_type: 'audio',
      content: '[Ãudio]',
      ai_input_text: null,
      derived_text: null,
      media_transcript: 'Paciente quer remarcar a consulta',
    })).toContain('Paciente quer remarcar a consulta')
  })

  it('converts inbound ogg to wav and sends it to OpenAI mini transcribe by default', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    const wavBuffer = Buffer.from('wav-binary')
    mocks.convertAudioForTranscription.mockResolvedValue({
      ok: true,
      buffer: wavBuffer,
      failureReason: null,
      binaryPath: '/opt/ffmpeg-static/ffmpeg',
      binarySource: 'ffmpeg-static',
      platform: 'linux',
      arch: 'x64',
      exitCode: 0,
      signal: null,
      stderrFull: '',
      stderrPreview: null,
      inputBytes: 12,
      outputBytes: wavBuffer.length,
    })
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Quero marcar para amanhÃ£' })

    const inputBuffer = Buffer.from('audio-binary')
    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Ãudio]',
      buffer: inputBuffer,
      resolvedMime: 'audio/ogg',
    })

    expect(mocks.convertAudioForTranscription).toHaveBeenCalledWith(inputBuffer, 'audio/ogg')
    expect(mocks.toFile).toHaveBeenCalledWith(wavBuffer, 'audio.wav', { type: 'audio/wav' })
    expect(mocks.transcriptionsCreate).toHaveBeenCalledWith({
      file: { name: 'audio.wav' },
      model: 'gpt-4o-mini-transcribe',
      language: 'pt',
    })
    expect(result).toMatchObject({
      provider: 'openai',
      derivedKind: 'transcription',
      derivedText: 'Quero marcar para amanhÃ£',
      mediaTranscript: 'Quero marcar para amanhÃ£',
      processingStatus: 'processed',
      processingError: null,
    })
    expect(result.aiInputText).toContain('Quero marcar para amanhÃ£')
  })

  it('uses OPENAI_TRANSCRIPTION_MODEL override when provided', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    vi.stubEnv('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-transcribe')
    mocks.convertAudioForTranscription.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('wav-binary'),
      failureReason: null,
      binaryPath: '/opt/ffmpeg-static/ffmpeg',
      binarySource: 'ffmpeg-static',
      platform: 'linux',
      arch: 'x64',
      exitCode: 0,
      signal: null,
      stderrFull: '',
      stderrPreview: null,
      inputBytes: 12,
      outputBytes: 10,
    })
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Quero marcar para amanhÃ£' })

    await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Ãudio]',
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
      content: '[Ãudio]',
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

  it('skips ffmpeg and OpenAI entirely when the source OGG was already flagged as truncated', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[ÃƒÂudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg',
      oggTruncated: true,
    })

    expect(mocks.convertAudioForTranscription).not.toHaveBeenCalled()
    expect(mocks.toFile).not.toHaveBeenCalled()
    expect(mocks.transcriptionsCreate).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: null,
      derivedText: null,
      derivedKind: null,
      aiInputText: null,
      mediaTranscript: null,
      processingStatus: 'failed',
      processingError: 'audio_source_truncated',
    })
  })

  it('falls back to a single raw OpenAI attempt when wav conversion fails for a supported mime', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    mocks.transcriptionsCreate.mockResolvedValue({ text: 'Paciente quer reagendar' })

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Ãudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/ogg; codecs=opus',
    })

    expect(mocks.toFile).toHaveBeenCalledWith(Buffer.from('audio-binary'), 'audio.ogg', { type: 'audio/ogg' })
    expect(result).toMatchObject({
      provider: 'openai',
      derivedKind: 'transcription',
      mediaTranscript: 'Paciente quer reagendar',
      processingStatus: 'processed',
      processingError: null,
    })
  })

  it('keeps the classified conversion error when no raw fallback is technically viable', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Ãudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'application/octet-stream',
    })

    expect(mocks.toFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai',
      processingStatus: 'failed',
      processingError: 'audio_conversion_nonzero_exit',
    })
  })

  it('returns provider failure when the raw fallback is attempted but OpenAI rejects it', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    mocks.transcriptionsCreate.mockRejectedValue(new Error('provider unavailable'))

    const result = await processDownloadedMultimodalMessage({
      contentType: 'audio',
      content: '[Ãudio]',
      buffer: Buffer.from('audio-binary'),
      resolvedMime: 'audio/webm',
    })

    expect(mocks.toFile).toHaveBeenCalledWith(Buffer.from('audio-binary'), 'audio.webm', { type: 'audio/webm' })
    expect(result).toMatchObject({
      provider: 'openai',
      processingStatus: 'failed',
      processingError: 'transcription_provider_failed',
    })
  })

  it('processes image analysis only with OpenAI and fails clearly without it', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    mocks.completionsCreate.mockResolvedValue({
      choices: [{ message: { content: 'Print com resultados do exame e texto legÃ­vel.' } }],
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
      derivedText: 'Print com resultados do exame e texto legÃ­vel.',
      processingStatus: 'processed',
      processingError: null,
    })
    expect(success.aiInputText).toContain('Print com resultados do exame e texto legÃ­vel.')

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
