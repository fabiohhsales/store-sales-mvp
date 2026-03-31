'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Check, ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import type { AgendaAppointment } from '@/types/pipeline'

interface AgendaTableProps {
  clientId: string
  token?: string
}

interface AgendaViewError {
  message: string
  errorId?: string
}

function normalizeAppointmentStatus(status: string | null | undefined): string | null {
  if (!status) return null
  return status === 'no_show' ? 'noshow' : status
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Agendado', variant: 'secondary' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  attended: { label: 'Compareceu', variant: 'default' },
  noshow: { label: 'Não compareceu', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
  rescheduled: { label: 'Reagendado', variant: 'outline' },
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now)
  const from = new Date(now)

  switch (period) {
    case 'today':
      break
    case 'week':
      from.setDate(from.getDate() - 7)
      to.setDate(to.getDate() + 7)
      break
    case 'month':
      from.setDate(1)
      to.setMonth(to.getMonth() + 1, 0)
      break
    case 'all':
      from.setFullYear(2020)
      to.setFullYear(2030)
      break
    default:
      break
  }

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export function AgendaTable({ clientId, token }: AgendaTableProps) {
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AgendaViewError | null>(null)
  const [periodFilter, setPeriodFilter] = useState('week')
  const [statusFilter, setStatusFilter] = useState('all')

  // Contexto da conversa ativa no Chatwoot (via postMessage do Dashboard App)
  const [activeChatwootPhone, setActiveChatwootPhone] = useState<string | null>(null)

  // Confirmação de ação
  const [confirmAction, setConfirmAction] = useState<{
    appointmentId: string
    status: string
    label: string
  } | null>(null)

  const fetchAppointments = useCallback(async () => {
    try {
      const { from, to } = getDateRange(periodFilter)
      const params = new URLSearchParams({
        ...(token ? { token } : { client_id: clientId }),
        date_from: from,
        date_to: to,
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      })

      const res = await fetch(`/api/agenda?${params}`)
      if (!res.ok) {
        const data = await res.json()
        const err = new Error(data.error || 'Erro ao carregar agenda')
        ;(err as Error & { errorId?: string }).errorId = data?.errorId
        throw err
      }

      const data = await res.json()
      const normalized = (data as AgendaAppointment[]).map((apt) => ({
        ...apt,
        status: normalizeAppointmentStatus(apt.status),
      }))
      setAppointments(normalized)
      setError(null)
    } catch (err) {
      console.error('[agenda-table] fetchAppointments error', err)
      if (err instanceof Error) {
        const maybeWithErrorId = err as Error & { errorId?: string }
        setError({
          message: err.message,
          errorId: maybeWithErrorId.errorId,
        })
      } else {
        setError({ message: 'Erro desconhecido' })
      }
    } finally {
      setLoading(false)
    }
  }, [clientId, token, periodFilter, statusFilter])

  useEffect(() => {
    setLoading(true)
    fetchAppointments()
  }, [fetchAppointments])

  // Escuta o contexto da conversa ativa enviado pelo Chatwoot ao Dashboard App
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.event === 'appContext') {
        const phone: string | undefined = event.data?.data?.contact?.phone_number
        setActiveChatwootPhone(phone ?? null)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  async function handleUpdateStatus(appointmentId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/agenda/${appointmentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(token ? { token } : { client_id: clientId }),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Erro ao atualizar status')
      }

      const normalizedStatus = normalizeAppointmentStatus(newStatus)

      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, status: normalizedStatus } : a))
      )
      toast.success('Status atualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar status')
    } finally {
      setConfirmAction(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3 max-w-md px-4">
          <p className="text-destructive font-medium">Falha ao carregar Agenda</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          {error.errorId && (
            <p className="text-xs text-muted-foreground">ID de erro: {error.errorId}</p>
          )}
          <button
            onClick={() => { setLoading(true); fetchAppointments() }}
            className="text-sm text-primary hover:underline"
          >
            Recarregar Agenda
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="scheduled">Agendado</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="attended">Compareceu</SelectItem>
            <SelectItem value="noshow">Não compareceu</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      {appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mb-2" />
          <p className="text-sm">Nenhum agendamento encontrado</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Meet</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((apt) => {
                const config = STATUS_CONFIG[apt.status || 'scheduled'] || STATUS_CONFIG.scheduled
                // Destaca a linha se o telefone do contato ativo no Chatwoot corresponde
                const isActive =
                  activeChatwootPhone != null &&
                  apt.contact_phone != null &&
                  apt.contact_phone.replace(/\D/g, '').endsWith(
                    activeChatwootPhone.replace(/\D/g, '').slice(-9)
                  )
                return (
                  <TableRow key={apt.id} className={isActive ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDateTime(apt.start_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {apt.contact_name || 'Sem nome'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {apt.contact_phone || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {apt.title || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {apt.meet_link ? (
                        <a
                          href={apt.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 text-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Abrir
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() =>
                            setConfirmAction({
                              appointmentId: apt.id,
                              status: 'attended',
                              label: 'Marcar como compareceu?',
                            })
                          }
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Compareceu
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            setConfirmAction({
                              appointmentId: apt.id,
                              status: 'noshow',
                              label: 'Marcar como não compareceu?',
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Faltou
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ação</DialogTitle>
            <DialogDescription>{confirmAction?.label}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (confirmAction) {
                  handleUpdateStatus(confirmAction.appointmentId, confirmAction.status)
                }
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
