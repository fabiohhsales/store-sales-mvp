// Schema Zod exato da saída estruturada do AI Agent.
// Baseado no Structured Output Parser do wf-principal.json.

import { z } from 'zod/v4'

const IntentEnum = z.enum([
  'triagem',
  'qualificacao',
  'agendamento',
  'confirmacao',
  'pos',
  'humano',
  'outro',
])

const StatusEnum = z.enum(['pending', 'open', 'resolved'])

const ClassificationSchema = z.object({
  intent: IntentEnum,
  stage: z.string().nullable(),
  status: StatusEnum,
})

export const AgentOutputSchema = z.object({
  reply: z.string().nullable(),
  // The AI sometimes emits numbers/booleans (e.g. {"age": 35, "smoker": false}).
  // Coerce primitive values to string here so the rest of the pipeline keeps
  // receiving Record<string, string> as advertised. Arrays/objects/null still fail.
  intake_save: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).transform(String))
    .nullable()
    .optional()
    .default(null),
  status_next: StatusEnum,
  labels_next: z.array(z.string()).min(1),
  classification: ClassificationSchema,
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
    detected_intent: IntentEnum,
    stage_current: z.string().nullable(),
    notes: z.string().nullable(),
  }),
})

export type AgentOutput = z.infer<typeof AgentOutputSchema>

type ParseAgentOutputOptions = {
  validStageSlugs?: string[]
}

// Fallback seguro quando o output da IA não pode ser parseado
export const fallbackOutput: AgentOutput = {
  reply: null,
  intake_save: null,
  status_next: 'pending',
  labels_next: ['etapa_triagem'],
  classification: {
    intent: 'outro',
    stage: null,
    status: 'pending',
  },
  handoff: { needs_human: false, reason: null },
  actions: {
    agenda_check: { should_check: false, time_window_hint: null },
    agenda_create: { should_create: false, start_iso: null, end_iso: null, title: null },
    agenda_update: { should_update: false, google_event_id: null },
  },
  debug: { detected_intent: 'outro', stage_current: null, notes: 'parse_error' },
}

const VALID_INTENTS = new Set<string>(IntentEnum.options)
const VALID_STATUSES = new Set<string>(StatusEnum.options)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeLabelSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeOutputCandidate(
  candidate: Record<string, unknown>,
  options?: ParseAgentOutputOptions
): Record<string, unknown> {
  const statusNext =
    typeof candidate.status_next === 'string' && VALID_STATUSES.has(candidate.status_next)
      ? candidate.status_next
      : 'pending'

  const validStageSlugs = new Set(
    (options?.validStageSlugs ?? [])
      .map((value) => normalizeLabelSlug(value))
      .filter(Boolean)
  )

  const incomingLabels = Array.isArray(candidate.labels_next)
    ? candidate.labels_next
    : []
  const normalizedLabels: string[] = []
  for (const value of incomingLabels) {
    if (typeof value !== 'string') continue
    const slug = normalizeLabelSlug(value)
    if (!slug) continue
    if (normalizedLabels.includes(slug)) continue
    normalizedLabels.push(slug)
  }

  const debug = isObject(candidate.debug) ? candidate.debug : {}
  const detectedIntent =
    typeof debug.detected_intent === 'string' && VALID_INTENTS.has(debug.detected_intent)
      ? debug.detected_intent
      : 'outro'
  const stageCurrent = typeof debug.stage_current === 'string' ? debug.stage_current : null

  const classificationRaw = isObject(candidate.classification) ? candidate.classification : {}

  const normalizedStageCurrent = typeof stageCurrent === 'string' ? normalizeLabelSlug(stageCurrent) : null
  const normalizedClassificationStage =
    typeof classificationRaw.stage === 'string' ? normalizeLabelSlug(classificationRaw.stage) : null

  const inferredStageFromLabels = normalizedLabels.find((label) => {
    if (!label.startsWith('etapa_')) {
      return false
    }

    if (validStageSlugs.size === 0) {
      return true
    }

    return validStageSlugs.has(label)
  })

  const validStageFromClassification =
    normalizedClassificationStage &&
    normalizedClassificationStage.startsWith('etapa_') &&
    (validStageSlugs.size === 0 || validStageSlugs.has(normalizedClassificationStage))
      ? normalizedClassificationStage
      : null

  const validStageFromDebug =
    normalizedStageCurrent &&
    normalizedStageCurrent.startsWith('etapa_') &&
    (validStageSlugs.size === 0 || validStageSlugs.has(normalizedStageCurrent))
      ? normalizedStageCurrent
      : null

  const defaultStage = validStageSlugs.values().next().value ?? 'etapa_triagem'
  const stageLabel =
    inferredStageFromLabels ??
    validStageFromClassification ??
    validStageFromDebug ??
    defaultStage

  const nonStageLabels = normalizedLabels.filter((label) => !label.startsWith('etapa_'))
  candidate.labels_next = [stageLabel, ...nonStageLabels]

  candidate.classification = {
    intent:
      typeof classificationRaw.intent === 'string' && VALID_INTENTS.has(classificationRaw.intent)
        ? classificationRaw.intent
        : detectedIntent,
    stage: stageLabel,
    status:
      typeof classificationRaw.status === 'string' && VALID_STATUSES.has(classificationRaw.status)
        ? classificationRaw.status
        : statusNext,
  }

  candidate.debug = {
    detected_intent: detectedIntent,
    stage_current: stageLabel,
    notes: typeof debug.notes === 'string' ? debug.notes : null,
  }

  return candidate
}

// Tenta extrair JSON válido de uma string (lida com markdown code fences, texto extra)
export function safeParseAgentOutput(raw: string | object, options?: ParseAgentOutputOptions): AgentOutput {
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

  if (isObject(obj)) {
    obj = normalizeOutputCandidate(obj, options)
  }

  const result = AgentOutputSchema.safeParse(obj)
  if (!result.success) {
    console.warn('[AgentOutput] Validação Zod falhou:', result.error.issues)
    return fallbackOutput
  }

  let parsed = result.data

  if (parsed.classification.status !== parsed.status_next) {
    parsed = {
      ...parsed,
      classification: {
        ...parsed.classification,
        status: parsed.status_next,
      },
    }
  }

  // Regra hard: se needs_human=true → status_next forçado para 'open', reply=null
  if (parsed.handoff.needs_human) {
    return {
      ...parsed,
      status_next: 'open',
      classification: {
        ...parsed.classification,
        status: 'open',
      },
      reply: null,
    }
  }

  return parsed
}
