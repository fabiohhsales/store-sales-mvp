import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  runLeadCadencePipeline: vi.fn(),
  runAtendimentoCadencePipeline: vi.fn(),
  runAgendadoCadencePipeline: vi.fn(),
  reconcileOrphanedSteps: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/followup/lead-cadence', () => ({
  runLeadCadencePipeline: mocks.runLeadCadencePipeline,
}))

vi.mock('@/lib/followup/atendimento-cadence', () => ({
  runAtendimentoCadencePipeline: mocks.runAtendimentoCadencePipeline,
}))

vi.mock('@/lib/followup/agendado-cadence', () => ({
  runAgendadoCadencePipeline: mocks.runAgendadoCadencePipeline,
}))

vi.mock('@/lib/followup/shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/followup/shared')>('@/lib/followup/shared')
  return {
    ...actual,
    reconcileOrphanedSteps: mocks.reconcileOrphanedSteps,
  }
})

describe('POST /api/followups/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runLeadCadencePipeline.mockResolvedValue({ clients: 1, stepsSent: 2, skippedOutsideHours: false })
    mocks.runAtendimentoCadencePipeline.mockResolvedValue({
      clients: 1,
      stepsSent: 1,
      skippedOutsideHours: false,
    })
    mocks.runAgendadoCadencePipeline.mockResolvedValue({
      clients: 1,
      stepsSent: 3,
      skippedOutsideHours: false,
    })
    mocks.reconcileOrphanedSteps.mockResolvedValue(4)
  })

  it('runs the selected cadence scope for admins and forwards the client_id', async () => {
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'admin-1',
      clientId: '',
      isAdmin: true,
    })

    const { POST } = await import('@/app/api/followups/run/route')
    const response = await POST(
      new NextRequest(
        new Request('https://panel.example.com/api/followups/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: 'client-1', cadence: 'all' }),
        })
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      client_id: 'client-1',
      cadence: 'all',
      reconciled: 4,
    })
    expect(mocks.runLeadCadencePipeline).toHaveBeenCalledWith('client-1')
    expect(mocks.runAtendimentoCadencePipeline).toHaveBeenCalledWith('client-1')
    expect(mocks.runAgendadoCadencePipeline).toHaveBeenCalledWith('client-1')
  })

  it('rejects operators', async () => {
    mocks.resolveDeskUser.mockResolvedValue({
      userId: 'op-1',
      clientId: 'client-1',
      isAdmin: false,
    })

    const { POST } = await import('@/app/api/followups/run/route')
    const response = await POST(
      new NextRequest(
        new Request('https://panel.example.com/api/followups/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: 'client-1', cadence: 'lead' }),
        })
      )
    )

    expect(response.status).toBe(403)
    expect(mocks.runLeadCadencePipeline).not.toHaveBeenCalled()
  })
})
