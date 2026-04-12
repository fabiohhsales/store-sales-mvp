import type { AiTone, BusinessSegment, WorkingHours } from './database'

// ── Intermediate draft type — lives only in the frontend ──────────────────────
// After the guided onboarding flow, this is mapped to PanelBotConfigInsert
// via mapOnboardingDraftToPanelBotConfig() before being sent to the API.

export type HandoffReason =
  | 'negative_sentiment'
  | 'medical_urgency'
  | 'unknown_intent'
  | 'user_request'
  | 'price_negotiation'
  | 'complaint'

export interface OnboardingService {
  name: string
  duration_minutes: number
  modality: 'presencial' | 'teleconsulta' | 'ambos'
}

export interface OnboardingDraft {
  /** 4.1 — Identity & context */
  business: {
    segment: BusinessSegment | ''
    businessName: string
    professionalName: string
    professionalTitle: string
    phone: string
    language: string
    tone: AiTone
  }

  /** 4.2 — What the bot should do */
  goals: {
    qualifies: boolean
    schedules: boolean
    supports: boolean
    followup: boolean
    usesHumanHandoff: boolean
  }

  /** 4.3 — Operational rules (conditional on goals) */
  flow: {
    requiresIntake: boolean
    intakeFields: string[]
    asksForMedia: boolean
    handoffReasons: HandoffReason[]
  }

  scheduling: {
    defaultDuration: number
    bufferMinutes: number
    sameDayBooking: boolean
    maxAdvanceDays: number
    minAdvanceHours: number
  }

  services: OnboardingService[]

  followupModes: {
    appointment: boolean
    lead: boolean
    attendance: boolean
  }

  workingHours: WorkingHours
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  tuesday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  wednesday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  thursday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  friday: { enabled: true, start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' },
  saturday: { enabled: false, start: '08:00', end: '12:00', break_start: null, break_end: null },
  sunday: { enabled: false, start: '08:00', end: '12:00', break_start: null, break_end: null },
}

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  business: {
    segment: '',
    businessName: '',
    professionalName: '',
    professionalTitle: '',
    phone: '',
    language: 'pt-BR',
    tone: 'professional_friendly',
  },
  goals: {
    qualifies: true,
    schedules: false,
    supports: false,
    followup: false,
    usesHumanHandoff: false,
  },
  flow: {
    requiresIntake: false,
    intakeFields: ['full_name', 'phone'],
    asksForMedia: false,
    handoffReasons: ['negative_sentiment', 'medical_urgency'],
  },
  scheduling: {
    defaultDuration: 60,
    bufferMinutes: 15,
    sameDayBooking: true,
    maxAdvanceDays: 60,
    minAdvanceHours: 2,
  },
  services: [],
  followupModes: {
    appointment: true,
    lead: false,
    attendance: false,
  },
  workingHours: DEFAULT_WORKING_HOURS,
}

// ── Phase 2 placeholder ───────────────────────────────────────────────────────

export type OnboardingPresetKey =
  | 'clinica_simples'
  | 'clinica_triagem'
  | 'estetica_fotos'
  | 'comercial_sdr'
  | 'suporte_hibrido'

export interface OnboardingPreset {
  key: OnboardingPresetKey
  label: string
  description: string
  patch: Partial<OnboardingDraft>
}

// ── Phase 3 placeholder ───────────────────────────────────────────────────────

export interface SimulationScenario {
  title: string
  messages: Array<{ from: 'user' | 'bot'; text: string }>
}

export interface OnboardingSimulationPreview {
  greeting: string
  scenarios: SimulationScenario[]
  summary: string
}
