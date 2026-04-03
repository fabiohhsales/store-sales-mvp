import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  updateAgendaAppointmentStatus: vi.fn(),
}))

vi.mock('@/lib/auth/embed-token', () => ({
  authenticateRequest: mocks.authenticateRequest,
}))

vi.mock('@/lib/agenda/service', () => ({
  updateAgendaAppointmentStatus: mocks.updateAgendaAppointmentStatus,
}))

describe('PATCH /api/agenda/[id]/status', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({
      client_id: 'client-1',
      authenticated: true,
      source: 'session',
      role: 'admin',
    })
  })

  it('retorna 400 para status inválido', async () => {
    const { PATCH } = await import('@/app/api/agenda/[id]/status/route')
    const response = await PATCH(
      {
        json: async () => ({
          client_id: 'client-1',
          status: 'broken_status',
        }),
      } as never,
      { params: Promise.resolve({ id: 'apt-1' }) }
    )

    expect(response.status).toBe(400)
  })

  it('atualiza status quando o agendamento pertence ao cliente autenticado', async () => {
    mocks.updateAgendaAppointmentStatus.mockResolvedValue({
      id: 'apt-1',
      status: 'attended',
    })

    const { PATCH } = await import('@/app/api/agenda/[id]/status/route')
    const response = await PATCH(
      {
        json: async () => ({
          client_id: 'client-1',
          status: 'attended',
        }),
      } as never,
      { params: Promise.resolve({ id: 'apt-1' }) }
    )

    expect(mocks.updateAgendaAppointmentStatus).toHaveBeenCalledWith('apt-1', 'client-1', 'attended')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: 'apt-1',
      status: 'attended',
    })
  })
})
