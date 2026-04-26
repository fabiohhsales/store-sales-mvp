'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CadenceType, FollowupTarget } from '@/types/followup'

const CADENCE_OPTIONS: Array<{ value: CadenceType; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'agendado', label: 'Agendado' },
]

interface Props {
  open: boolean
  clientId: string
  presetTarget?: FollowupTarget | null
  presetCadence?: CadenceType | null
  onOpenChange: (open: boolean) => void
  onSent?: () => void
}

export function FollowupSendModal({
  open,
  clientId,
  presetTarget = null,
  presetCadence = null,
  onOpenChange,
  onSent,
}: Props) {
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [query, setQuery] = useState('')
  const [targets, setTargets] = useState<FollowupTarget[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<FollowupTarget | null>(presetTarget)
  const [cadenceType, setCadenceType] = useState<CadenceType>(presetCadence ?? 'lead')
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    if (!open) return

    setMode('manual')
    setInstruction('')
    setMessage('')
    setQuery('')
    setSelectedTarget(presetTarget)
    setCadenceType(presetCadence ?? presetTarget?.active_cadence ?? 'lead')
  }, [open, presetCadence, presetTarget])

  useEffect(() => {
    if (!open || presetTarget) return

    let cancelled = false

    async function loadTargets() {
      setLoadingTargets(true)
      try {
        const params = new URLSearchParams({ client_id: clientId, q: deferredQuery })
        const response = await fetch(`/api/followups/targets?${params}`)
        const body = await response.json().catch(() => [])
        if (!response.ok) {
          throw new Error(body?.error ?? 'Erro ao carregar conversas')
        }
        if (!cancelled) {
          setTargets(body as FollowupTarget[])
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Erro ao carregar conversas')
        }
      } finally {
        if (!cancelled) {
          setLoadingTargets(false)
        }
      }
    }

    void loadTargets()

    return () => {
      cancelled = true
    }
  }, [clientId, deferredQuery, open, presetTarget])

  async function handleGenerate() {
    if (!selectedTarget) {
      toast.error('Selecione uma conversa')
      return
    }

    if (!instruction.trim()) {
      toast.error('Escreva a instrucao para a IA')
      return
    }

    setGenerating(true)
    try {
      const response = await fetch(`/api/followups/${selectedTarget.conversation_id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction.trim(),
          cadence_type: cadenceType,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao gerar mensagem')
      }
      setMessage(body.message ?? '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar mensagem')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSend() {
    if (!selectedTarget) {
      toast.error('Selecione uma conversa')
      return
    }

    if (!message.trim()) {
      toast.error('Mensagem obrigatoria')
      return
    }

    setSending(true)
    try {
      const response = await fetch(`/api/followups/${selectedTarget.conversation_id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          cadence_type: cadenceType,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao enviar follow-up')
      }

      toast.success('Follow-up enviado')
      onOpenChange(false)
      onSent?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar follow-up')
    } finally {
      setSending(false)
    }
  }

  const lockedTarget = !!presetTarget
  const lockedCadence = !!presetCadence

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar follow-up manual</DialogTitle>
          <DialogDescription>
            Selecione a conversa, escolha a cadencia e envie uma mensagem manual ou gerada por IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Conversa</Label>
            {lockedTarget ? (
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                <div className="font-medium">{selectedTarget?.contact_name}</div>
                <div className="text-muted-foreground">{selectedTarget?.contact_phone}</div>
              </div>
            ) : (
              <>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nome ou telefone"
                />
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border bg-background/60 p-2">
                  {loadingTargets ? (
                    <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Carregando conversas...
                    </div>
                  ) : targets.length === 0 ? (
                    <div className="px-2 py-6 text-sm text-muted-foreground">
                      Nenhuma conversa encontrada.
                    </div>
                  ) : (
                    targets.map((target) => {
                      const isSelected = selectedTarget?.conversation_id === target.conversation_id
                      return (
                        <button
                          key={target.conversation_id}
                          type="button"
                          onClick={() => {
                            setSelectedTarget(target)
                            if (!presetCadence && target.active_cadence) {
                              setCadenceType(target.active_cadence)
                            }
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-foreground'
                              : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="font-medium">{target.contact_name}</div>
                          <div className="text-xs">{target.contact_phone}</div>
                        </button>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cadencia</Label>
            {lockedCadence ? (
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                {CADENCE_OPTIONS.find((option) => option.value === cadenceType)?.label}
              </div>
            ) : (
              <Select value={cadenceType} onValueChange={(value) => setCadenceType(value as CadenceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Modo</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={mode === 'manual' ? 'secondary' : 'outline'}
                onClick={() => setMode('manual')}
              >
                Manual
              </Button>
              <Button variant={mode === 'ai' ? 'secondary' : 'outline'} onClick={() => setMode('ai')}>
                <Sparkles className="mr-1 size-4" />
                Via IA
              </Button>
            </div>
          </div>

          {mode === 'ai' && (
            <div className="space-y-2">
              <Label htmlFor="followup-ai-instruction">Instrucao para a IA</Label>
              <Textarea
                id="followup-ai-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Ex.: Reengaje este lead mencionando o desconto de 10%."
              />
              <Button variant="outline" onClick={handleGenerate} disabled={generating || !selectedTarget}>
                {generating ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-1 size-4" />
                )}
                Gerar preview
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="followup-message">
              {mode === 'ai' ? 'Mensagem final (editavel)' : 'Mensagem'}
            </Label>
            <Textarea
              id="followup-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Digite a mensagem que sera enviada."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Fechar
          </Button>
          <Button onClick={handleSend} disabled={sending || !selectedTarget || !message.trim()}>
            {sending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
