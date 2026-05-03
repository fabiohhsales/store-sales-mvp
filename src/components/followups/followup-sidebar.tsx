'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Inbox, Layers3, MessageCircleWarning, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CadenceType, FollowupOverviewSummary, FollowupTreeNode } from '@/types/followup'

const CADENCE_STYLES: Record<CadenceType, string> = {
  lead: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  atendimento: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  agendado: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
}

interface Props {
  tree: FollowupTreeNode[]
  summary: FollowupOverviewSummary | null
  selectedCadence: CadenceType | 'all'
  selectedStep: string | null
  onSelect: (cadence: CadenceType | 'all', step?: string | null) => void
}

export function FollowupSidebar({
  tree,
  summary,
  selectedCadence,
  selectedStep,
  onSelect,
}: Props) {
  const [expanded, setExpanded] = useState<Record<CadenceType, boolean>>({
    lead: true,
    atendimento: true,
    agendado: true,
  })

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card/60 p-3">
        <Button
          variant={selectedCadence === 'all' && !selectedStep ? 'secondary' : 'ghost'}
          className="w-full justify-between"
          onClick={() => onSelect('all', null)}
        >
          <span className="flex items-center gap-2">
            <Inbox className="size-4" />
            Todos
          </span>
          <Badge variant="outline">{(tree ?? []).reduce((sum, node) => sum + (node.count ?? 0), 0)}</Badge>
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-3">
        <div className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Layers3 className="size-3.5" />
          Cadencias
        </div>

        <div className="space-y-2">
          {(tree ?? []).map((node) => {
            const isCadenceSelected = selectedCadence === node.cadence && !selectedStep
            const hasSelectedStep =
              selectedCadence === node.cadence &&
              !!selectedStep &&
              (node.steps ?? []).some((step) => step.step_key === selectedStep)

            return (
              <div key={node.cadence} className="rounded-xl border border-border/70 bg-background/40">
                <div className="flex items-center gap-2 p-2">
                  <Button
                    variant={isCadenceSelected || hasSelectedStep ? 'secondary' : 'ghost'}
                    className="flex-1 justify-between"
                    onClick={() => onSelect(node.cadence, null)}
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className={CADENCE_STYLES[node.cadence]}>
                        {node.label}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">{node.count}</span>
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [node.cadence]: !current[node.cadence],
                      }))
                    }
                  >
                    {expanded[node.cadence] ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                </div>

                {expanded[node.cadence] && (
                  <div className="space-y-1 px-2 pb-2">
                    {(node.steps ?? []).map((step) => {
                      const isSelected =
                        selectedCadence === node.cadence && selectedStep === step.step_key

                      return (
                        <button
                          key={step.step_key}
                          type="button"
                          onClick={() => onSelect(node.cadence, step.step_key)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-foreground'
                              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                          }`}
                        >
                          <span>{step.label}</span>
                          <span className="text-xs">{step.count}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Resumo
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Layers3 className="size-4" />
              Fluxos ativos
            </span>
            <span className="font-semibold">{summary?.activeFlows ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Send className="size-4" />
              Envios na janela
            </span>
            <span className="font-semibold">{summary?.sentStepsInWindow ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <MessageCircleWarning className="size-4" />
              Aguardando resposta
            </span>
            <span className="font-semibold">{summary?.waitingResponseConversations ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
