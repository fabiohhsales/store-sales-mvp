// Verifies the structured skip observability wired into the 3 follow-up
// cadences. The helper itself is unit-tested for its log shape. Each public
// pipeline entry is then exercised on the simplest skip path (a row without
// `panel_whatsapp_config`) to prove the wiring reaches the helper.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

// Stub the WhatsApp sender so any accidental fall-through is harmless.
vi.mock('@/lib/api/evolution', () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
}))

import { logFollowupSkip } from '@/lib/followup/business-hours'
import { runLeadCadencePipeline } from '@/lib/followup/lead-cadence'
import { runAtendimentoCadencePipeline } from '@/lib/followup/atendimento-cadence'
import { runAgendadoCadencePipeline } from '@/lib/followup/agendado-cadence'

/**
 * Returns a Supabase admin fake whose only `from('panel_bot_config').select(...).eq(...).eq(...)`
 * chain resolves to a single row WITHOUT `panel_whatsapp_config` — the cleanest
 * way to trigger the `sem_whatsapp_config` skip in every cadence pipeline.
 */
function buildAdminWithRowMissingWhatsapp() {
  function selectChain() {
    return {
      eq() {
        return {
          eq() {
            return Promise.resolve({
              data: [
                {
                  client_id: 'client-A',
                  timezone: 'America/Sao_Paulo',
                  working_hours: null,
                  panel_clients: { id: 'client-A', status: 'active' },
                  panel_whatsapp_config: null,
                },
              ],
              error: null,
            })
          },
        }
      },
    }
  }
  return {
    from() {
      return {
        select: selectChain,
      }
    },
  }
}

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('logFollowupSkip helper', () => {
  it('emits a single structured console.log with prefixed cadence and reason', () => {
    logFollowupSkip('lead', 'fora_do_horario', { clientId: 'client-A' })
    logFollowupSkip('atendimento', 'sem_step_elegivel', {
      clientId: 'client-B',
      conversationId: 'conv-9',
    })
    logFollowupSkip('agendado', 'sem_whatsapp_config', {
      clientId: 'client-C',
      appointmentId: 'appt-7',
    })

    expect(logSpy).toHaveBeenCalledTimes(3)
    expect(logSpy.mock.calls[0][0]).toBe('[Followup lead] skip reason=fora_do_horario')
    expect(logSpy.mock.calls[0][1]).toEqual({ clientId: 'client-A' })
    expect(logSpy.mock.calls[1][0]).toBe('[Followup atendimento] skip reason=sem_step_elegivel')
    expect(logSpy.mock.calls[1][1]).toMatchObject({ clientId: 'client-B', conversationId: 'conv-9' })
    expect(logSpy.mock.calls[2][0]).toBe('[Followup agendado] skip reason=sem_whatsapp_config')
    expect(logSpy.mock.calls[2][1]).toMatchObject({ clientId: 'client-C', appointmentId: 'appt-7' })
  })
})

describe('cadence pipelines emit sem_whatsapp_config skip when row lacks WhatsApp config', () => {
  it('lead cadence', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdminWithRowMissingWhatsapp())

    const summary = await runLeadCadencePipeline()
    expect(summary.stepsSent).toBe(0)

    const skipCalls = logSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        args[0] === '[Followup lead] skip reason=sem_whatsapp_config'
    )
    expect(skipCalls).toHaveLength(1)
    expect(skipCalls[0][1]).toEqual({ clientId: 'client-A' })
  })

  it('atendimento cadence', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdminWithRowMissingWhatsapp())

    const summary = await runAtendimentoCadencePipeline()
    expect(summary.stepsSent).toBe(0)

    const skipCalls = logSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        args[0] === '[Followup atendimento] skip reason=sem_whatsapp_config'
    )
    expect(skipCalls).toHaveLength(1)
  })

  it('agendado cadence', async () => {
    mocks.createAdminClient.mockReturnValue(buildAdminWithRowMissingWhatsapp())

    const summary = await runAgendadoCadencePipeline()
    expect(summary.stepsSent).toBe(0)

    const skipCalls = logSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        args[0] === '[Followup agendado] skip reason=sem_whatsapp_config'
    )
    expect(skipCalls).toHaveLength(1)
  })
})
