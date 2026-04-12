import type { OnboardingDraft } from '@/types/onboarding'

export type OnboardingBlock =
  | 'scheduling'
  | 'intake'
  | 'handoff'
  | 'working_hours'
  | 'followup_modes'

/**
 * Returns the list of operation blocks that should be visible
 * in the OperationsBlock (sub-step 4.3) based on the user's goals.
 * `working_hours` is always included.
 */
export function getVisibleBlocks(draft: OnboardingDraft): OnboardingBlock[] {
  const blocks: OnboardingBlock[] = ['working_hours']

  if (draft.goals.schedules) {
    blocks.push('scheduling')
  }

  // Intake is relevant when qualifying or scheduling
  if (draft.goals.qualifies || draft.goals.schedules) {
    blocks.push('intake')
  }

  if (draft.goals.usesHumanHandoff) {
    blocks.push('handoff')
  }

  if (draft.goals.followup) {
    blocks.push('followup_modes')
  }

  return blocks
}

/**
 * Returns a short validation message if the draft is not ready to proceed
 * from a given sub-step, or null if it's ok.
 *
 * Level 1 — required fields (sub-steps 1 and 2)
 * Level 2 — conditional coherence (sub-step 3)
 */
export function validateSubStep(
  draft: OnboardingDraft,
  subStep: number
): string | null {
  if (subStep === 1) {
    if (!draft.business.professionalName.trim()) {
      return 'Nome do responsável é obrigatório'
    }
  }

  if (subStep === 2) {
    if (!Object.values(draft.goals).some(Boolean)) {
      return 'Selecione ao menos um objetivo para o bot'
    }
  }

  if (subStep === 3) {
    // Level 2: validate operational coherence based on selected goals

    // If scheduling is enabled, at least one working day must be active
    if (draft.goals.schedules) {
      const anyDayEnabled = Object.values(draft.workingHours).some((d) => d.enabled)
      if (!anyDayEnabled) {
        return 'Configure ao menos um dia de atendimento para habilitar agendamentos'
      }
    }

    // If human handoff is enabled, at least one trigger must be selected
    if (draft.goals.usesHumanHandoff && draft.flow.handoffReasons.length === 0) {
      return 'Selecione ao menos um gatilho para ativar o atendimento humano'
    }
  }

  return null
}
