// Fonte única de thresholds SLA para o Desk.
// Defaults hardcoded aqui; podem ser sobrepostos por tenant via panel_bot_config.sla_thresholds.

export interface SlaThresholds {
  /** Minutos para badge verde → âmbar */
  greenMaxMin: number
  /** Minutos para badge âmbar → vermelho */
  amberMaxMin: number
  /** Minutos sem operador atribuído para gerar warning */
  noOperatorWarnMin: number
  /** Minutos de silêncio do operador para gerar warning */
  operatorSilenceWarnMin: number
  /** Minutos de espera para gerar toast SLA */
  toastThresholdMin: number
}

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  greenMaxMin: 15,
  amberMaxMin: 60,
  noOperatorWarnMin: 30,
  operatorSilenceWarnMin: 120,
  toastThresholdMin: 60,
}

/**
 * Merge de thresholds do tenant (parciais) com defaults.
 */
export function resolveSlaThresholds(
  tenantOverrides?: Partial<SlaThresholds> | null
): SlaThresholds {
  if (!tenantOverrides) return DEFAULT_SLA_THRESHOLDS
  return { ...DEFAULT_SLA_THRESHOLDS, ...tenantOverrides }
}
