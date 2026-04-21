'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Filter,
  Menu,
  PlayCircle,
  RefreshCcw,
  SendHorizonal,
  SlidersHorizontal,
} from 'lucide-react'
import { FollowupCancelDialog } from '@/components/followups/followup-cancel-dialog'
import { FollowupConversationCard } from '@/components/followups/followup-conversation-card'
import { FollowupSendModal } from '@/components/followups/followup-send-modal'
import { FollowupSidebar } from '@/components/followups/followup-sidebar'
import type {
  CadenceType,
  FollowupConversation,
  FollowupConversationsResponse,
  FollowupOverviewSummary,
  FollowupStatusFilter,
  FollowupTarget,
} from '@/types/followup'

interface ClientOption {
  id: string
  name: string
}

interface OverviewResponse {
  summary: FollowupOverviewSummary
}

interface Props {
  clients: ClientOption[]
  initialClientId: string
  viewerRole: 'admin' | 'operator'
}

type RunCadence = 'lead' | 'atendimento' | 'agendado' | 'all'

function buildTargetFromConversation(conversation: FollowupConversation): FollowupTarget {
  return {
    conversation_id: conversation.conversation_id,
    contact_id: conversation.contact_id,
    contact_name: conversation.contact_name,
    contact_phone: conversation.contact_phone,
    stage: conversation.stage,
    active_cadence: conversation.cadence_type,
  }
}

export function FollowupsPageClient({ clients, initialClientId, viewerRole }: Props) {
  const [clientId, setClientId] = useState(initialClientId)
  const [days, setDays] = useState('30')
  const [statusFilter, setStatusFilter] = useState<FollowupStatusFilter>('all')
  const [selectedCadence, setSelectedCadence] = useState<CadenceType | 'all'>('all')
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [overview, setOverview] = useState<FollowupOverviewSummary | null>(null)
  const [conversationsData, setConversationsData] = useState<FollowupConversationsResponse | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendPresetTarget, setSendPresetTarget] = useState<FollowupTarget | null>(null)
  const [sendPresetCadence, setSendPresetCadence] = useState<CadenceType | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelConversation, setCancelConversation] = useState<FollowupConversation | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runCadence, setRunCadence] = useState<RunCadence>('all')
  const [runningCadence, setRunningCadence] = useState(false)

  const isAdmin = viewerRole === 'admin'
  const selectedClientName = useMemo(
    () => clients.find((client) => client.id === clientId)?.name ?? 'Cliente',
    [clientId, clients]
  )

  const fetchOverview = useCallback(async () => {
    if (!clientId) return

    setLoadingOverview(true)
    try {
      const params = new URLSearchParams({ client_id: clientId, days })
      const response = await fetch(`/api/followups/overview?${params}`)
      const body = (await response.json().catch(() => ({}))) as Partial<OverviewResponse> & { error?: string }

      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao carregar o overview de follow-ups')
      }

      setOverview(body.summary ?? null)
    } finally {
      setLoadingOverview(false)
    }
  }, [clientId, days])

  const fetchConversations = useCallback(async () => {
    if (!clientId) return

    setLoadingConversations(true)
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        status: statusFilter,
        page: String(page),
        per_page: '20',
      })
      if (selectedCadence !== 'all') {
        params.set('cadence', selectedCadence)
      }
      if (selectedStep) {
        params.set('step', selectedStep)
      }

      const response = await fetch(`/api/followups/conversations?${params}`)
      const body = (await response.json().catch(() => ({}))) as FollowupConversationsResponse & {
        error?: string
      }

      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao carregar as conversas')
      }

      setConversationsData(body)
      setError(null)
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Erro desconhecido ao carregar as conversas'
      setError(message)
      setConversationsData(null)
    } finally {
      setLoadingConversations(false)
    }
  }, [clientId, page, selectedCadence, selectedStep, statusFilter])

  useEffect(() => {
    void fetchOverview().catch((fetchError) => {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Erro ao carregar o overview de follow-ups'
      setError(message)
      toast.error(message)
    })
  }, [fetchOverview])

  useEffect(() => {
    void fetchConversations()
  }, [fetchConversations])

  async function refreshAll() {
    try {
      await Promise.all([fetchOverview(), fetchConversations()])
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Erro ao atualizar a central'
      setError(message)
      toast.error(message)
    }
  }

  function handleSidebarSelect(cadence: CadenceType | 'all', step: string | null = null) {
    setSelectedCadence(cadence)
    setSelectedStep(step)
    setPage(1)
    setMobileSidebarOpen(false)
  }

  function openHeaderSendModal() {
    setSendPresetTarget(null)
    setSendPresetCadence(null)
    setSendModalOpen(true)
  }

  function openCardSendModal(conversation: FollowupConversation) {
    setSendPresetTarget(buildTargetFromConversation(conversation))
    setSendPresetCadence(conversation.cadence_type)
    setSendModalOpen(true)
  }

  function openCancelDialog(conversation: FollowupConversation) {
    setCancelConversation(conversation)
    setCancelDialogOpen(true)
  }

  async function handleCancelConfirm() {
    if (!cancelConversation) return

    setCancelling(true)
    try {
      const response = await fetch(`/api/followups/${cancelConversation.conversation_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence_type: cancelConversation.cadence_type }),
      })
      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao cancelar a cadencia')
      }

      toast.success('Cadencia cancelada')
      setCancelDialogOpen(false)
      setCancelConversation(null)
      await refreshAll()
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : 'Erro ao cancelar a cadencia')
    } finally {
      setCancelling(false)
    }
  }

  async function handleRunCadence() {
    setRunningCadence(true)
    try {
      const response = await fetch('/api/followups/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          cadence: runCadence,
        }),
      })
      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao disparar a cadencia')
      }

      toast.success('Cadencia disparada')
      setRunDialogOpen(false)
      await refreshAll()
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : 'Erro ao disparar a cadencia')
    } finally {
      setRunningCadence(false)
    }
  }

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Nenhum cliente ativo encontrado.
      </div>
    )
  }

  const tree = conversationsData?.tree ?? []
  const conversations = conversationsData?.conversations ?? []
  const totalPages = conversationsData?.pagination.totalPages ?? 0
  const filteredTotal = conversationsData?.summary.filteredTotal ?? 0

  return (
    <>
      <div className="space-y-5 animate-fade-in">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card/40 p-4 shadow-sm lg:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Central de Follow Ups
              </h1>
              <p className="text-sm text-muted-foreground">
                Operacao por cadencia e step, com envio manual e cancelamento persistente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && clients.length > 1 ? (
                <Select
                  value={clientId}
                  onValueChange={(value) => {
                    if (!value) return
                    setClientId(value)
                    setPage(1)
                    setSelectedCadence('all')
                    setSelectedStep(null)
                  }}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                  {selectedClientName}
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm hover:bg-secondary">
                  <Filter className="size-4" />
                  Filtros
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Status da lista</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value as FollowupStatusFilter)
                      setPage(1)
                    }}
                  >
                    <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="waiting_response">
                      Aguardando resposta
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="responded">Respondidos</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Janela das metricas</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={days} onValueChange={(value) => setDays(value)}>
                    <DropdownMenuRadioItem value="7">Ultimos 7 dias</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="30">Ultimos 30 dias</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="60">Ultimos 60 dias</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="90">Ultimos 90 dias</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                className="lg:hidden"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="mr-1 size-4" />
                Cadencias
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <SlidersHorizontal className="size-4" />+ Acao
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={openHeaderSendModal}>
                    <SendHorizonal className="mr-2 size-4" />
                    Enviar follow-up manual
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setRunDialogOpen(true)}>
                      <PlayCircle className="mr-2 size-4" />
                      Disparar cadencia agora
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" onClick={() => void refreshAll()}>
                <RefreshCcw className="mr-1 size-4" />
                Atualizar
              </Button>
            </div>
          </div>

          {loadingOverview ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Fluxos ativos
                </div>
                <div className="mt-2 text-3xl font-semibold">{overview?.activeFlows ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Envios na janela
                </div>
                <div className="mt-2 text-3xl font-semibold">{overview?.sentStepsInWindow ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Aguardando resposta
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {overview?.waitingResponseConversations ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Tentativas sem resposta
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {overview?.waitingResponseAttempts ?? 0}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <FollowupSidebar
              tree={tree}
              summary={overview}
              selectedCadence={selectedCadence}
              selectedStep={selectedStep}
              onSelect={handleSidebarSelect}
            />
          </aside>

          <section className="space-y-4">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {filteredTotal} conversa(s) na selecao atual
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedCadence === 'all'
                    ? 'Visualizando todas as cadencias ativas.'
                    : `Filtrado por ${selectedCadence}${selectedStep ? ` / ${selectedStep}` : ''}.`}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Pagina {conversationsData?.pagination.page ?? 1}
                {totalPages ? ` de ${totalPages}` : ''}
              </div>
            </div>

            {loadingConversations ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-44 w-full rounded-2xl" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
                <p className="font-medium text-destructive">Erro ao carregar a central</p>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" className="mt-4" onClick={() => void refreshAll()}>
                  Tentar novamente
                </Button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/60 p-10 text-center text-muted-foreground">
                Nenhuma conversa em follow-up para os filtros atuais.
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {conversations.map((conversation) => (
                    <FollowupConversationCard
                      key={`${conversation.conversation_id}:${conversation.cadence_type}`}
                      clientId={clientId}
                      conversation={conversation}
                      onSend={openCardSendModal}
                      onCancel={openCancelDialog}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4">
                  <div className="text-sm text-muted-foreground">
                    Exibindo {conversations.length} item(ns) nesta pagina.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page <= 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPage((current) => current + 1)}
                      disabled={page >= totalPages}
                    >
                      Proxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-full max-w-sm p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Cadencias e steps</SheetTitle>
            <SheetDescription>Navegue pelas etapas da central operacional.</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <FollowupSidebar
              tree={tree}
              summary={overview}
              selectedCadence={selectedCadence}
              selectedStep={selectedStep}
              onSelect={handleSidebarSelect}
            />
          </div>
        </SheetContent>
      </Sheet>

      <FollowupSendModal
        open={sendModalOpen}
        clientId={clientId}
        presetTarget={sendPresetTarget}
        presetCadence={sendPresetCadence}
        onOpenChange={setSendModalOpen}
        onSent={() => void refreshAll()}
      />

      <FollowupCancelDialog
        open={cancelDialogOpen}
        conversation={cancelConversation}
        submitting={cancelling}
        onOpenChange={setCancelDialogOpen}
        onConfirm={() => void handleCancelConfirm()}
      />

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disparar cadencia agora</DialogTitle>
            <DialogDescription>
              Essa acao executa manualmente os pipelines do cliente selecionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="followup-run-cadence">Cadencia</Label>
            <Select value={runCadence} onValueChange={(value) => setRunCadence(value as RunCadence)}>
              <SelectTrigger id="followup-run-cadence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="atendimento">Atendimento</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)} disabled={runningCadence}>
              Fechar
            </Button>
            <Button onClick={() => void handleRunCadence()} disabled={runningCadence}>
              {runningCadence ? <RefreshCcw className="mr-1 size-4 animate-spin" /> : null}
              Disparar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
