'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCcw, Send, TrendingUp, Activity, MessageCircleWarning } from 'lucide-react'

type CadenceType = 'lead' | 'atendimento' | 'agendado'

interface ClientOption {
  id: string
  name: string
}

interface FollowupsResponse {
  summary: {
    activeFlows: number
    sentStepsInWindow: number
    waitingResponseConversations: number
    waitingResponseAttempts: number
    windowDays: number
  }
  flows: Array<{
    cadence: CadenceType
    inFlow: number
    sentStepsInWindow: number
    waitingResponse: number
    maxAttemptsWithoutResponse: number
    levels: Array<{ stepKey: string; count: number }>
  }>
  recent: Array<{
    id: string
    sent_at: string
    cadence: CadenceType | null
    step_key: string | null
    contact_name: string
    contact_phone: string | null
    message_preview: string | null
    waiting_response: boolean
    attempts_without_response: number
  }>
}

const CADENCE_META: Record<CadenceType, { label: string; className: string }> = {
  lead: { label: 'Lead', className: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
  atendimento: { label: 'Atendimento', className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
  agendado: { label: 'Agendado', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeStepLabel(stepKey: string | null): string {
  if (!stepKey) return 'sem_step'
  return stepKey
    .replace('lead_', '')
    .replace('atendimento_', '')
    .replace('agendado_', '')
}

interface Props {
  clients: ClientOption[]
  initialClientId: string
  viewerRole: 'admin' | 'operator'
}

export function FollowupsPageClient({ clients, initialClientId, viewerRole }: Props) {
  const [storedMode] = useState<'admin' | 'client'>(() => {
    if (typeof window === 'undefined') return 'admin'
    const saved = localStorage.getItem('sidebar-mode')
    return saved === 'client' ? 'client' : 'admin'
  })
  const [clientId, setClientId] = useState(initialClientId)
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FollowupsResponse | null>(null)

  const mode = viewerRole === 'operator' ? 'client' : storedMode

  const selectedClientName = useMemo(
    () => clients.find((c) => c.id === clientId)?.name ?? 'Cliente',
    [clients, clientId]
  )

  const fetchOverview = useCallback(async () => {
    if (!clientId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ client_id: clientId, days })
      const res = await fetch(`/api/followups/overview?${params}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? 'Erro ao carregar Follow Ups')
      setData(body as FollowupsResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [clientId, days])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Nenhum cliente ativo encontrado.
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Follow Ups</h1>
          <p className="text-sm text-muted-foreground">
            Visão operacional dos fluxos, níveis e tentativas sem resposta.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'admin' && clients.length > 1 && (
            <Select value={clientId} onValueChange={(val) => val && setClientId(val)}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {mode === 'admin' && clients.length === 1 && (
            <span className="text-sm text-muted-foreground">{clients[0].name}</span>
          )}

          {mode === 'client' && (
            <span className="text-sm text-muted-foreground">{selectedClientName}</span>
          )}

          <Select value={days} onValueChange={(value) => setDays(value ?? '30')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>

          <button
            onClick={fetchOverview}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center space-y-2">
          <p className="text-destructive font-medium">Erro ao carregar Follow Ups</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={fetchOverview} className="text-sm text-primary hover:underline">
            Tentar novamente
          </button>
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Fluxos ativos</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.activeFlows}</p>
            </div>
            <div className="glass-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Envios na janela</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.sentStepsInWindow}</p>
            </div>
            <div className="glass-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Aguardando resposta</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.waitingResponseConversations}</p>
            </div>
            <div className="glass-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Tentativas sem resposta</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.waitingResponseAttempts}</p>
            </div>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Fluxos por cadência</h2>
              <span className="text-xs text-muted-foreground ml-auto">navegação por níveis</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {data.flows.map((flow) => (
                <div key={flow.cadence} className="rounded-lg border border-border p-3 space-y-3 bg-card/40">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={CADENCE_META[flow.cadence].className}>
                      {CADENCE_META[flow.cadence].label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{flow.sentStepsInWindow} envios</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-secondary/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Em fluxo</p>
                      <p className="text-sm font-bold">{flow.inFlow}</p>
                    </div>
                    <div className="rounded-md bg-secondary/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Sem resposta</p>
                      <p className="text-sm font-bold">{flow.waitingResponse}</p>
                    </div>
                    <div className="rounded-md bg-secondary/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Máx tentativas</p>
                      <p className="text-sm font-bold">{flow.maxAttemptsWithoutResponse}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Níveis</p>
                    {flow.levels.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem envios nessa janela.</p>
                    ) : (
                      flow.levels.map((level) => (
                        <div key={level.stepKey} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{normalizeStepLabel(level.stepKey)}</span>
                          <span className="font-semibold text-foreground">{level.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Eventos recentes</h2>
              <span className="text-xs text-muted-foreground ml-auto">logs de follow-up</span>
            </div>

            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum follow-up enviado na janela selecionada.</p>
            ) : (
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {data.recent.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3 bg-card/40 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        <Send className="h-3 w-3 mr-1" />
                        {item.cadence ? CADENCE_META[item.cadence].label : 'Sem cadência'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {item.step_key ?? 'sem_step'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground ml-auto">{formatDate(item.sent_at)}</span>
                    </div>

                    <div className="text-sm">
                      <span className="font-medium text-foreground">{item.contact_name}</span>
                      {item.contact_phone && <span className="text-muted-foreground"> • {item.contact_phone}</span>}
                    </div>

                    {item.message_preview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.message_preview}</p>
                    )}

                    {item.waiting_response && (
                      <div className="flex items-center gap-1 text-[11px] text-amber-400">
                        <MessageCircleWarning className="h-3.5 w-3.5" />
                        Sem resposta após {item.attempts_without_response} tentativa(s)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
