import type { StageLabelConfig } from '@/types/database'

export const DEFAULT_STAGE_LABELS: StageLabelConfig[] = [
  { slug: 'etapa_triagem', display_name: 'Triagem', followup_cadence: 'lead' },
  { slug: 'etapa_qualificacao', display_name: 'Qualificação', followup_cadence: 'atendimento' },
  { slug: 'etapa_agendando', display_name: 'Agendando', followup_cadence: null },
  { slug: 'etapa_agendado', display_name: 'Agendado', followup_cadence: 'agendado' },
  { slug: 'etapa_confirmado', display_name: 'Confirmado', followup_cadence: 'agendado' },
  { slug: 'etapa_paciente', display_name: 'Paciente', followup_cadence: 'atendimento' },
  { slug: 'etapa_inativo', display_name: 'Inativo', followup_cadence: null },
]

function sanitizeFollowupCadence(value: unknown): StageLabelConfig['followup_cadence'] {
  if (value === 'lead' || value === 'atendimento' || value === 'agendado') {
    return value
  }

  return null
}

export function normalizeStageSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function sanitizeStageLabels(labels: StageLabelConfig[] | null | undefined): StageLabelConfig[] {
  const source = labels && labels.length > 0 ? labels : DEFAULT_STAGE_LABELS
  const deduped = new Map<string, StageLabelConfig>()

  for (const item of source) {
    const slug = normalizeStageSlug(item.slug)
    const displayName = item.display_name?.trim()
    const followupCadence = sanitizeFollowupCadence(item.followup_cadence)

    if (!slug || !displayName) continue
    if (!deduped.has(slug)) {
      deduped.set(slug, { slug, display_name: displayName, followup_cadence: followupCadence })
    }
  }

  if (deduped.size === 0) return [...DEFAULT_STAGE_LABELS]
  return [...deduped.values()]
}

export function stageLabelSlugs(labels: StageLabelConfig[] | null | undefined): string[] {
  return sanitizeStageLabels(labels).map((item) => item.slug)
}
