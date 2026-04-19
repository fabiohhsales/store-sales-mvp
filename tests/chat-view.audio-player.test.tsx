// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ''} />,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}))

import { MessageBubble, type Message } from '@/components/desk/chat-view'

function makeAudioMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-audio-1',
    content: '[Ãudio]',
    content_type: 'audio',
    sender_type: 'contact',
    from_who: 'lead',
    created_at: '2026-04-19T12:00:00Z',
    evolution_message_id: 'evo-audio-1',
    media_url: 'client-1/conv-1/evo-audio-1.ogg',
    media_mime_type: 'audio/ogg',
    media_filename: 'audio.ogg',
    media_size_bytes: 11,
    media_duration_seconds: 14,
    media_transcript: null,
    whatsapp_status: null,
    derived_text: null,
    derived_kind: null,
    processing_status: 'processed',
    processing_error: null,
    ai_input_text: null,
    sent_to_agent_at: null,
    ...overrides,
  }
}

describe('MessageBubble audio playback regressions', () => {
  it('keeps the audio element mounted when processing_status becomes failed', () => {
    const initialMessage = makeAudioMessage()
    const { container, rerender } = render(
      <MessageBubble
        message={initialMessage}
        conversationId="conv-1"
      />
    )

    const audioBefore = container.querySelector('audio')
    expect(audioBefore).toBeInTheDocument()
    expect(audioBefore).toHaveAttribute('src', '/api/desk/media?msg_id=evo-audio-1&conversation_id=conv-1')

    rerender(
      <MessageBubble
        message={makeAudioMessage({
          processing_status: 'failed',
          processing_error: 'audio_conversion_binary_unavailable',
        })}
        conversationId="conv-1"
      />
    )

    const audioAfter = container.querySelector('audio')
    expect(audioAfter).toBe(audioBefore)
    expect(audioAfter).toHaveAttribute('src', '/api/desk/media?msg_id=evo-audio-1&conversation_id=conv-1')
    expect(container.textContent).toContain('Falhou')
  })

  it('does not reload the player when only transcript and media metadata fields change', () => {
    const { container, rerender } = render(
      <MessageBubble
        message={makeAudioMessage()}
        conversationId="conv-1"
      />
    )

    const audioBefore = container.querySelector('audio')
    expect(audioBefore).toBeInTheDocument()

    rerender(
      <MessageBubble
        message={makeAudioMessage({
          derived_text: 'Paciente pediu reagendamento',
          media_transcript: 'Paciente pediu reagendamento',
          media_url: 'client-1/conv-1/evo-audio-1-v2.ogg',
          media_mime_type: 'audio/webm',
          processing_status: 'failed',
          processing_error: 'transcription_provider_failed',
        })}
        conversationId="conv-1"
      />
    )

    const audioAfter = container.querySelector('audio')
    expect(audioAfter).toBe(audioBefore)
    expect(audioAfter).toHaveAttribute('src', '/api/desk/media?msg_id=evo-audio-1&conversation_id=conv-1')
    expect(container.textContent).toContain('Ver transcri')
  })

  it('shows the truncated-source bubble label without unmounting the player', () => {
    const { container, rerender } = render(
      <MessageBubble
        message={makeAudioMessage()}
        conversationId="conv-1"
      />
    )

    const audioBefore = container.querySelector('audio')
    expect(audioBefore).toBeInTheDocument()

    rerender(
      <MessageBubble
        message={makeAudioMessage({
          processing_status: 'failed',
          processing_error: 'audio_source_truncated',
        })}
        conversationId="conv-1"
      />
    )

    const audioAfter = container.querySelector('audio')
    expect(audioAfter).toBe(audioBefore)
    expect(audioAfter).toHaveAttribute('src', '/api/desk/media?msg_id=evo-audio-1&conversation_id=conv-1')
    expect(container.textContent).toContain('Áudio incompleto')
    expect(container.textContent).toContain('WhatsApp não entregou o arquivo inteiro')
  })
})
