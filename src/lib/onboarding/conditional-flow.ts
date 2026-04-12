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
  return null
}
