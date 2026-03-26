// Schema Zod exato da saída estruturada do AI Agent.
// Baseado no Structured Output Parser do wf-principal.json.

import { z } from 'zod/v4'

export const AgentOutputSchema = z.object({
  reply: z.string().nullable(),
  status_next: z.enum(['pending', 'open', 'resolved']),
  labels_next: z.array(z.string()).min(1),
  handoff: z.object({
    needs_human: z.boolean(),
    reason: z.string().nullable(),
  }),
  actions: z.object({
    agenda_check: z.object({
      should_check: z.boolean(),
      time_window_hint: z.string().nullable(),
    }),
    agenda_create: z.object({
      should_create: z.boolean(),
      start_iso: z.string().nullable(),
      end_iso: z.string().nullable(),
      title: z.string().nullable(),
    }),
    agenda_update: z.object({
      should_update: z.boolean(),
      google_event_id: z.string().nullable(),
    }),
  }),
  debug: z.object({
    detected_intent: z.enum([
      'triagem',
      'qualificacao',
      'agendamento',
      'confirmacao',
      'pos',
      'humano',
      'outro',
    ]),
    stage_current: z.string().nullable(),
    notes: z.string().nullable(),
  }),
})

export type AgentOutput = z.infer<typeof AgentOutputSchema>

// Fallback seguro quando o output da IA não pode ser parseado
export const fallbackOutput: AgentOutput = {
  reply: null,
  status_next: 'pending',
  labels_next: ['etapa_triagem'],
  handoff: { needs_human: false, reason: null },
  actions: {
    agenda_check: { should_check: false, time_window_hint: null },
    agenda_create: { should_create: false, start_iso: null, end_iso: null, title: null },
    agenda_update: { should_update: false, google_event_id: null },
  },
  debug: { detected_intent: 'outro', stage_current: null, notes: 'parse_error' },
}

// Tenta extrair JSON válido de uma string (lida com markdown code fences, texto extra)
export function safeParseAgentOutput(raw: string | object): AgentOutput {
  let obj: unknown = raw

  if (typeof raw === 'string') {
    let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const first = s.indexOf('{')
    const last = s.lastIndexOf('}')
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
    try {
      obj = JSON.parse(s)
    } catch {
      console.warn('[AgentOutput] Falha ao parsear JSON:', s.slice(0, 200))
      return fallbackOutput
    }
  }

  const result = AgentOutputSchema.safeParse(obj)
  if (!result.success) {
    console.warn('[AgentOutput] Validação Zod falhou:', result.error.issues)
    return fallbackOutput
  }

  // Regra hard: se needs_human=true → status_next forçado para 'open', reply=null
  if (result.data.handoff.needs_human) {
    return { ...result.data, status_next: 'open', reply: null }
  }

  return result.data
}
