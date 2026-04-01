import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncConnectionStateFromWebhook: vi.fn(),
  normalizeEvolutionPayload: vi.fn(),
  runEvolutionPipeline: vi.fn(),
  runAgent: vi.fn(),
  dispatch: vi.fn(),
}))

vi.mock('@/lib/whatsapp/connection-state', () => ({
  syncConnectionStateFromWebhook: mocks.syncConnectionStateFromWebhook,
}))

vi.mock('@/lib/bot/normalize-evolution', () => ({
  normalizeEvolutionPayload: mocks.normalizeEvolutionPayload,
}))

vi.mock('@/lib/bot/pipeline', () => ({
  runEvolutionPipeline: mocks.runEvolutionPipeline,
}))

vi.mock('@/lib/bot/agent', () => ({
  runAgent: mocks.runAgent,
}))

vi.mock('@/lib/bot/dispatcher', () => ({
  dispatch: mocks.dispatch,
}))

describe('POST /api/webhooks/evolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sincroniza connection.update sem debounce funcional', async () => {
    const { POST } = await import('@/app/api/webhooks/evolution/route')
    const response = await POST({
      json: async () => ({
        event: 'connection.update',
        instance: 'clinic-instance',
        state: 'connecting',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(mocks.syncConnectionStateFromWebhook).toHaveBeenCalledWith('clinic-instance', 'connecting')
  })
})
