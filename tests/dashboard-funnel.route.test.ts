import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  resolveDeskUser: vi.fn(),
  createAdminClient: vi.fn(),
  getBotConfigByClientId: vi.fn(),
}))

vi.mock('@/lib/desk/auth', () => ({
  resolveDeskUser: mocks.resolveDeskUser,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/db/bot-config', () => ({
  getBotConfigByClientId: mocks.getBotConfigByClientId,
}))

function makeQuery(result: { data: unknown; error: null }) {
  const query: any = {
    select() {
      return query
    },
    eq() {
      return query
    },
    in() {
      return query
    },
    gte() {
      return query
    },
    lte() {
      return query
    },
    order() {
      return query
    },
    limit() {
      return query
    },
    then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return query
}

function buildAdmin(data: {
  conversations: Array<Record<string, unknown>>
  followups: Array<Record<string, unknown>>
  appointments: Array<Record<string, unknown>>
}) {
  const admin = {
    from(table: string) {
      if (table === 'conversations') {
        return makeQuery({ data: data.conversations, error: null })
      }
      if (table === 'followup_cadence_steps') {
        return makeQuery({ data: data.followups, error: null })
      }
      if (table === 'appointments') {
        return makeQuery({ data: data.appointments, error: null })
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return admin
}

describe('GET /api/dashboard/funnel', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T12:00:00Z'))

    mocks.resolveDeskUser.mockResolvedValue({ clientId: 'client-1' })
    mocks.getBotConfigByClientId.mockResolvedValue({
      stage_labels: [
        { slug: 'etapa_triagem', display_name: 'Triagem' },
        { slug: 'etapa_qualificacao', display_name: 'Qualificação' },
        { slug: 'etapa_agendado', display_name: 'Agendado' },
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserva os campos legados e adiciona as seções agrupadas por modelo', async () => {
    mocks.createAdminClient.mockReturnValue(
      buildAdmin({
        conversations: [
          {
            id: 'conv-1',
            stage: 'bot_triage',
            labels: ['vip', 'etapa_triagem'],
            last_incoming_at: '2026-04-12T09:00:00Z',
            resolved_at: null,
          },
          {
            id: 'conv-2',
            stage: 'awaiting_human',
            labels: ['etapa_qualificacao'],
            last_incoming_at: '2026-04-10T12:00:00Z',
            resolved_at: null,
          },
          {
            id: 'conv-3',
            stage: 'resolved',
            labels: ['etapa_agendado'],
            last_incoming_at: '2026-04-05T12:00:00Z',
            resolved_at: '2026-04-10T12:00:00Z',
          },
        ],
        followups: [
          { cadence_type: 'lead' },
          { cadence_type: 'atendimento' },
          { cadence_type: 'agendado' },
        ],
        appointments: [
          { status: 'confirmed' },
          { status: 'scheduled' },
          { status: 'noshow' },
        ],
      })
    )

    const { GET } = await import('@/app/api/dashboard/funnel/route')
    const request = new NextRequest(new Request('https://panel.example.com/api/dashboard/funnel?client_id=client-1'))
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      stageCounts: { bot_triage: 1, awaiting_human: 1, in_service: 0, resolved_week: 1 },
      temperatureCounts: { hot: 1, warm: 1, cold: 0, frozen: 0 },
      followupSentWeek: { lead: 1, atendimento: 1, agendado: 1 },
      agendaWeek: { total: 3, confirmed: 1, scheduled: 1, noshow: 1 },
      funnelCounts: { etapa_triagem: 1, etapa_qualificacao: 1, etapa_agendado: 0, _sem_etapa: 0 },
    })

    expect(body.operational).toMatchObject({
      stageCounts: body.stageCounts,
      temperatureCounts: body.temperatureCounts,
    })
    expect(body.commercial).toMatchObject({
      source: 'labels[]',
      funnelCounts: body.funnelCounts,
    })
    expect(body.commercial.funnelLabels.map((item: { slug: string }) => item.slug)).toEqual([
      'etapa_triagem',
      'etapa_qualificacao',
      'etapa_agendado',
    ])
    expect(body.followup.sentWeek).toEqual(body.followupSentWeek)
    expect(body.agenda.week).toEqual(body.agendaWeek)
  })
})
