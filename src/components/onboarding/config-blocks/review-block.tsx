'use client'

import { CheckCircle2, AlertCircle } from 'lucide-react'
import type { OnboardingDraft } from '@/types/onboarding'

interface Props {
  draft: OnboardingDraft
}

const SEGMENT_LABELS: Record<string, string> = {
  medicina: 'Medicina',
  odontologia: 'Odontologia',
  psicologia: 'Psicologia',
  fisioterapia: 'Fisioterapia',
  estetica: 'Estética',
  outro: 'Outro',
}

const TONE_LABELS: Record<string, string> = {
  formal: 'formal',
  professional_friendly: 'profissional e amigável',
  casual: 'casual',
  empathetic: 'empático',
}

const HANDOFF_LABELS: Record<string, string> = {
  negative_sentiment: 'sentimento negativo',
  medical_urgency: 'urgência médica',
  unknown_intent: 'intenção não reconhecida',
  user_request: 'pedido explícito do usuário',
  price_negotiation: 'negociação de preço',
  complaint: 'reclamação',
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {ok
        ? <CheckCircle2 className="size-4 text-green-500 mt-0.5 shrink-0" />
        : <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
      }
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value || '—'}</p>
      </div>
    </div>
  )
}

export function ReviewBlock({ draft }: Props) {
  const { business, goals, flow, followupModes, services } = draft

  const goalText = [
    goals.qualifies && 'qualificar leads',
    goals.schedules && 'agendar consultas',
    goals.supports && 'suporte pós-atendimento',
    goals.followup && 'follow-up automático',
  ].filter(Boolean).join(', ')

  const handoffText = flow.handoffReasons.length > 0
    ? flow.handoffReasons.map((r) => HANDOFF_LABELS[r] ?? r).join(', ')
    : 'não configurado'

  const followupText = [
    followupModes.appointment && 'confirmação de consulta',
    followupModes.lead && 'reengajamento de leads',
    followupModes.attendance && 'pós-atendimento',
  ].filter(Boolean).join(', ') || 'nenhum'

  const serviceNames = services.filter((s) => s.name.trim()).map((s) => s.name).join(', ')

  return (
    <div className="space-y-5">

      {/* Narrative summary */}
      <div className="rounded-lg bg-muted/40 p-4">
        <p className="text-sm leading-relaxed">
          O bot da <strong>{business.businessName || 'empresa'}</strong> vai atender em{' '}
          <strong>{business.language === 'pt-BR' ? 'português' : business.language}</strong>{' '}
          com tom <strong>{TONE_LABELS[business.tone] ?? business.tone}</strong>.
          {goalText && <> Vai <strong>{goalText}</strong>.</>}
          {goals.usesHumanHandoff && flow.handoffReasons.length > 0 && (
            <> Vai transferir para humano em caso de: <strong>{handoffText}</strong>.</>
          )}
          {goals.followup && <> Follow-up ativo: <strong>{followupText}</strong>.</>}
          {flow.requiresIntake && (
            <> Vai coletar <strong>{flow.intakeFields.length} campo(s)</strong> antes de prosseguir
              {flow.asksForMedia && ', incluindo fotos ou documentos'}.
            </>
          )}
        </p>
      </div>

      {/* Detail table */}
      <div className="rounded-lg border divide-y">
        <div className="px-4 py-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Identidade</p>
        </div>
        <div className="px-4">
          <Row
            label="Responsável pelo atendimento"
            value={business.professionalName}
            ok={!!business.professionalName}
          />
          <Row
            label="Nome do negócio"
            value={business.businessName}
            ok={!!business.businessName}
          />
          <Row
            label="Segmento"
            value={SEGMENT_LABELS[business.segment] ?? business.segment}
            ok={!!business.segment}
          />
          <Row label="Tom" value={TONE_LABELS[business.tone] ?? business.tone} ok={true} />
          <Row label="Idioma" value={business.language} ok={true} />
          {serviceNames && (
            <Row label="Serviços" value={serviceNames} ok={true} />
          )}
        </div>
        <div className="px-4 py-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Objetivos e regras</p>
        </div>
        <div className="px-4">
          <Row
            label="Objetivos do bot"
            value={goalText || 'Nenhum selecionado'}
            ok={!!goalText}
          />
          {goals.usesHumanHandoff && (
            <Row label="Gatilhos de handoff" value={handoffText} ok={flow.handoffReasons.length > 0} />
          )}
          {goals.followup && (
            <Row label="Follow-up" value={followupText} ok={true} />
          )}
          {(goals.qualifies || goals.schedules) && (
            <Row
              label="Coleta de informações"
              value={
                flow.requiresIntake
                  ? `${flow.intakeFields.length} campos${flow.asksForMedia ? ' + mídia' : ''}`
                  : 'Não ativada'
              }
              ok={true}
            />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Você poderá ajustar qualquer detalhe após salvar através das configurações avançadas do cliente.
      </p>
    </div>
  )
}
