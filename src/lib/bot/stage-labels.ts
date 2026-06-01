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

export const DEFAULT_STORE_STAGE_LABELS: StageLabelConfig[] = [
  { slug: 'etapa_novo_lead', display_name: 'Novo Lead', followup_cadence: 'lead' },
  { slug: 'etapa_em_atendimento', display_name: 'Em Atendimento', followup_cadence: 'atendimento' },
  { slug: 'etapa_orcamento', display_name: 'Orçamento Enviado', followup_cadence: 'atendimento' },
  { slug: 'etapa_negociacao', display_name: 'Em Negociação', followup_cadence: 'atendimento' },
  { slug: 'etapa_aguardando_pagamento', display_name: 'Aguardando Pagamento', followup_cadence: 'lead' },
  { slug: 'etapa_pedido_pago', display_name: 'Pedido Pago', followup_cadence: null },
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

export function sanitizeStageLabels(
  labels: StageLabelConfig[] | null | undefined,
  segment?: string
): StageLabelConfig[] {
  const defaultLabels = segment === 'loja' ? DEFAULT_STORE_STAGE_LABELS : DEFAULT_STAGE_LABELS
  const source = labels && labels.length > 0 ? labels : defaultLabels
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

  if (deduped.size === 0) return [...defaultLabels]
  return [...deduped.values()]
}

export function stageLabelSlugs(labels: StageLabelConfig[] | null | undefined, segment?: string): string[] {
  return sanitizeStageLabels(labels, segment).map((item) => item.slug)
}
