'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { AgendaAppointment } from '@/types/pipeline'

type AgendaView = 'day' | 'week' | 'month' | 'list'

interface AgendaWorkspaceProps {
  clientId: string
  token?: string
  initialView?: AgendaView
}

interface AgendaResponse {
  items: AgendaAppointment[]
  meta: {
    view: AgendaView
    date: string
    date_from: string
    date_to: string
    page: number
    page_size: number
    total: number
    total_pages: number
  }
  totals: Record<string, number>
}

interface AppointmentFormState {
  id?: string
  contact_name: string
  contact_phone: string
  invitee_email: string
  title: string
  modality: string
  status: string
  start_at: string
  end_at: string
  notes: string
  sync_to_google: boolean
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos status' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'attended', label: 'Compareceu' },
  { value: 'noshow', label: 'Não compareceu' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'rescheduled', label: 'Reagendado' },
] as const

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  attended: 'bg-green-500/10 text-green-700 border-green-500/20',
  noshow: 'bg-red-500/10 text-red-700 border-red-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-700 border-zinc-500/20',
  rescheduled: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
}

const SYNC_BADGE: Record<string, string> = {
  synced: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  disabled: 'bg-zinc-500/10 text-zinc-700 border-zinc-500/20',
  error: 'bg-red-500/10 text-red-700 border-red-500/20',
}

function emptyForm(now = new Date()): AppointmentFormState {
  const start = new Date(now.getTime() + 60 * 60 * 1000)
  const end = new Date(start.getTime() + 60 * 60 * 1000)

  return {
    contact_name: '',
    contact_phone: '',
    invitee_email: '',
    title: '',
    modality: 'presencial',
    status: 'scheduled',
    start_at: toLocalDateTime(start.toISOString()),
    end_at: toLocalDateTime(end.toISOString()),
    notes: '',
    sync_to_google: true,
  }
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toLocalDateTime(value: string) {
  const date = new Date(value)
  const timezoneOffset = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function fromLocalDateTime(value: string) {
  return new Date(value).toISOString()
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDayLabel(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

function shiftDate(base: string, view: AgendaView, direction: number) {
  const date = new Date(`${base}T12:00:00`)
  if (view === 'month') date.setMonth(date.getMonth() + direction)
  else if (view === 'day') date.setDate(date.getDate() + direction)
  else date.setDate(date.getDate() + direction * 7)
  return toDateInput(date)
}

function buildPeriodDays(meta: AgendaResponse['meta']) {
  const from = new Date(`${meta.date_from}T12:00:00`)
  const to = new Date(`${meta.date_to}T12:00:00`)
  const days: string[] = []
  const cursor = new Date(from)
  while (cursor <= to) {
    days.push(toDateInput(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function getMonthGrid(anchorDate: string) {
  const anchor = new Date(`${anchorDate}T12:00:00`)
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12, 0, 0, 0)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12, 0, 0, 0)
  const gridStart = new Date(first)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const gridEnd = new Date(last)
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))

  const days: string[] = []
  const cursor = new Date(gridStart)
  while (cursor <= gridEnd) {
    days.push(toDateInput(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function badgeLabel(status: string | null) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Sem status'
}

function syncLabel(status: string) {
  if (status === 'synced') return 'Google ok'
  if (status === 'pending') return 'Sync pendente'
  if (status === 'error') return 'Erro de sync'
  return 'Sem sync'
}

export function AgendaWorkspace({
  clientId,
  token,
  initialView = 'week',
}: AgendaWorkspaceProps) {
  const [view, setView] = useState<AgendaView>(initialView)
  const [selectedDate, setSelectedDate] = useState<string>(toDateInput(new Date()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState<AgendaResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<AgendaAppointment | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<AppointmentFormState>(emptyForm())

  async function fetchAgenda() {
    setLoading(true)

    try {
      const params = new URLSearchParams({
        ...(token ? { token } : { client_id: clientId }),
        view,
        date: selectedDate,
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(query ? { query } : {}),
      })

      const response = await fetch(`/api/agenda?${params}`)
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || 'Erro ao carregar agenda')
      }

      setData(json)
      setError(null)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar agenda')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAgenda()
  }, [clientId, token, view, selectedDate, statusFilter, query])

  function openCreateDialog() {
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEditDialog(appointment: AgendaAppointment) {
    setForm({
      id: appointment.id,
      contact_name: appointment.contact_name ?? '',
      contact_phone: appointment.contact_phone ?? '',
      invitee_email: '',
      title: appointment.title ?? '',
      modality: appointment.modality ?? 'presencial',
      status: appointment.status ?? 'scheduled',
      start_at: toLocalDateTime(appointment.start_at),
      end_at: toLocalDateTime(appointment.end_at),
      notes: appointment.notes ?? '',
      sync_to_google: appointment.sync_status !== 'disabled',
    })
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.start_at || !form.end_at) {
      toast.error('Preencha início e fim do agendamento')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        ...(token ? { token } : { client_id: clientId }),
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        invitee_email: form.invitee_email || undefined,
        title: form.title,
        modality: form.modality,
        status: form.status,
        start_at: fromLocalDateTime(form.start_at),
        end_at: fromLocalDateTime(form.end_at),
        notes: form.notes,
        sync_to_google: form.sync_to_google,
      }

      const url = form.id ? `/api/agenda/${form.id}` : '/api/agenda'
      const method = form.id ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || 'Erro ao salvar agendamento')
      }

      toast.success(form.id ? 'Agendamento atualizado' : 'Agendamento criado')
      setFormOpen(false)
      setDetail(json)
      await fetchAgenda()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Erro ao salvar agendamento')
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStatus(appointmentId: string, status: string) {
    try {
      const response = await fetch(`/api/agenda/${appointmentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(token ? { token } : { client_id: clientId }),
          status,
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || 'Erro ao atualizar status')
      }

      toast.success('Status atualizado')
      if (detail?.id === appointmentId) {
        setDetail(json)
      }
      await fetchAgenda()
    } catch (statusError) {
      toast.error(statusError instanceof Error ? statusError.message : 'Erro ao atualizar status')
    }
  }

  async function cancelAppointment(appointmentId: string) {
    try {
      const response = await fetch(`/api/agenda/${appointmentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token } : { client_id: clientId }),
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || 'Erro ao cancelar agendamento')
      }

      toast.success('Agendamento cancelado')
      setDetail(null)
      await fetchAgenda()
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : 'Erro ao cancelar agendamento')
    }
  }

  function renderList(items: AgendaAppointment[]) {
    return (
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Quando</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((appointment) => (
              <TableRow key={appointment.id}>
                <TableCell>
                  <button className="text-left" onClick={() => setDetail(appointment)}>
                    <div className="font-medium">{appointment.contact_name || 'Sem nome'}</div>
                    <div className="text-xs text-muted-foreground">{appointment.contact_phone || 'Sem telefone'}</div>
                  </button>
                </TableCell>
                <TableCell>{appointment.title || '-'}</TableCell>
                <TableCell className="text-sm">{formatDateTime(appointment.start_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border', STATUS_BADGE[appointment.status ?? 'scheduled'])}>
                    {badgeLabel(appointment.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border', SYNC_BADGE[appointment.sync_status])}>
                    {syncLabel(appointment.sync_status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDetail(appointment)}>
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(appointment)}>
                      Editar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderDayOrWeek(items: AgendaAppointment[]) {
    const days = data ? buildPeriodDays(data.meta) : []
    const hours = Array.from({ length: 15 }, (_, index) => index + 7)

    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className={cn('grid border-b', days.length === 1 ? 'grid-cols-[72px_1fr]' : 'grid-cols-[72px_repeat(7,1fr)]')}>
          <div className="border-r p-3 text-xs text-muted-foreground">Hora</div>
          {days.map((day) => (
            <div key={day} className="border-r last:border-r-0 p-3 text-center">
              <div className="text-xs text-muted-foreground">{formatDayLabel(day)}</div>
            </div>
          ))}
        </div>
        <div className={cn('grid', days.length === 1 ? 'grid-cols-[72px_1fr]' : 'grid-cols-[72px_repeat(7,1fr)]')}>
          <div className="border-r">
            {hours.map((hour) => (
              <div key={hour} className="h-14 border-b p-2 text-xs text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayItems = items.filter((appointment) => appointment.start_at.slice(0, 10) === day)
            return (
              <div key={day} className="relative border-r last:border-r-0">
                {hours.map((hour) => (
                  <div key={hour} className="h-14 border-b" />
                ))}
                {dayItems.map((appointment) => {
                  const start = new Date(appointment.start_at)
                  const end = new Date(appointment.end_at)
                  const startHour = start.getHours() + start.getMinutes() / 60
                  const endHour = end.getHours() + end.getMinutes() / 60
                  const top = (startHour - 7) * 56
                  const height = Math.max((endHour - startHour) * 56, 28)

                  return (
                    <button
                      key={appointment.id}
                      className={cn(
                        'absolute left-1 right-1 rounded-lg border p-2 text-left text-xs shadow-sm transition hover:brightness-95',
                        STATUS_BADGE[appointment.status ?? 'scheduled']
                      )}
                      style={{ top, height }}
                      onClick={() => setDetail(appointment)}
                    >
                      <div className="font-medium">{appointment.contact_name || 'Sem nome'}</div>
                      <div>{appointment.title || badgeLabel(appointment.status)}</div>
                      <div className="opacity-70">{formatDateTime(appointment.start_at).slice(-5)}</div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderMonth(items: AgendaAppointment[]) {
    const monthDays = getMonthGrid(selectedDate)
    const currentMonth = selectedDate.slice(0, 7)

    return (
      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-7">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label) => (
          <div key={label} className="bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
        {monthDays.map((day) => {
          const dayItems = items.filter((appointment) => appointment.start_at.slice(0, 10) === day)
          const muted = !day.startsWith(currentMonth)
          return (
            <div key={day} className="min-h-36 bg-card p-3">
              <div className={cn('mb-3 text-sm font-semibold', muted && 'text-muted-foreground')}>
                {new Date(`${day}T12:00:00`).getDate()}
              </div>
              <div className="space-y-2">
                {dayItems.slice(0, 4).map((appointment) => (
                  <button
                    key={appointment.id}
                    className={cn(
                      'block w-full rounded-md border px-2 py-1 text-left text-xs',
                      STATUS_BADGE[appointment.status ?? 'scheduled']
                    )}
                    onClick={() => setDetail(appointment)}
                  >
                    <div className="truncate font-medium">{appointment.contact_name || 'Sem nome'}</div>
                    <div className="truncate">
                      {new Date(appointment.start_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      {appointment.title || ''}
                    </div>
                  </button>
                ))}
                {dayItems.length > 4 && (
                  <div className="text-xs text-muted-foreground">+{dayItems.length - 4} mais</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const appointments = data?.items ?? []
  const totalAppointments = data?.meta.total ?? 0

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(shiftDate(selectedDate, view, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(toDateInput(new Date()))}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(shiftDate(selectedDate, view, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex items-center rounded-lg border p-1">
              {[
                { value: 'day', label: 'Dia', icon: Calendar },
                { value: 'week', label: 'Semana', icon: CalendarDays },
                { value: 'month', label: 'Mês', icon: CalendarDays },
                { value: 'list', label: 'Lista', icon: List },
              ].map((option) => (
                <Button
                  key={option.value}
                  variant={view === option.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8"
                  onClick={() => setView(option.value as AgendaView)}
                >
                  <option.icon className="mr-1 h-4 w-4" />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setQuery(searchValue.trim())
                }}
                placeholder="Buscar paciente, telefone ou observação"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setQuery(searchValue.trim())}>
              Buscar
            </Button>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-1 h-4 w-4" />
              Novo agendamento
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{totalAppointments} agendamento(s) no período</span>
          {data?.totals.scheduled ? <span>{data.totals.scheduled} agendado(s)</span> : null}
          {data?.totals.confirmed ? <span>{data.totals.confirmed} confirmado(s)</span> : null}
          {data?.totals.noshow ? <span>{data.totals.noshow} no-show</span> : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-[32rem] w-full" />
        </div>
      ) : error ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-card px-6 text-center">
          <p className="font-medium text-destructive">Falha ao carregar Agenda</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void fetchAgenda()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Recarregar
          </Button>
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-card px-6 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nenhum agendamento encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajuste os filtros ou crie um novo agendamento para este período.
          </p>
        </div>
      ) : view === 'list' ? (
        renderList(appointments)
      ) : view === 'month' ? (
        renderMonth(appointments)
      ) : (
        renderDayOrWeek(appointments)
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
            <DialogDescription>
              Salve primeiro no Supabase e sincronize com Google Calendar quando disponível.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Paciente</label>
              <Input value={form.contact_name} onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Telefone</label>
              <Input value={form.contact_phone} onChange={(event) => setForm((prev) => ({ ...prev, contact_phone: event.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Email do convidado</label>
              <Input
                type="email"
                placeholder="email@exemplo.com — recebe convite por email"
                value={form.invitee_email}
                onChange={(event) => setForm((prev) => ({ ...prev, invitee_email: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Serviço</label>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Modalidade</label>
              <Input value={form.modality} onChange={(event) => setForm((prev) => ({ ...prev, modality: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Início</label>
              <Input type="datetime-local" value={form.start_at} onChange={(event) => setForm((prev) => ({ ...prev, start_at: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fim</label>
              <Input type="datetime-local" value={form.end_at} onChange={(event) => setForm((prev) => ({ ...prev, end_at: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value ?? prev.status }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sync_to_google}
                  onChange={(event) => setForm((prev) => ({ ...prev, sync_to_google: event.target.checked }))}
                />
                Tentar sincronizar com Google Calendar
              </label>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Observações</label>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitForm()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>Detalhes do agendamento</SheetTitle>
            <SheetDescription>
              Operação principal no Supabase, com sincronização externa opcional.
            </SheetDescription>
          </SheetHeader>
          {detail ? (
            <>
              <div className="flex-1 space-y-6 overflow-y-auto p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserRound className="h-4 w-4" />
                    Paciente
                  </div>
                  <div className="text-lg font-semibold">{detail.contact_name || 'Sem nome'}</div>
                  <div className="text-sm text-muted-foreground">{detail.contact_phone || 'Sem telefone'}</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">Quando</div>
                    <div className="font-medium">{formatDateTime(detail.start_at)}</div>
                    <div className="text-sm text-muted-foreground">
                      até {new Date(detail.end_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">Serviço</div>
                    <div className="font-medium">{detail.title || '-'}</div>
                    <div className="text-sm text-muted-foreground">{detail.modality || 'Sem modalidade'}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn('border', STATUS_BADGE[detail.status ?? 'scheduled'])}>
                    {badgeLabel(detail.status)}
                  </Badge>
                  <Badge variant="outline" className={cn('border', SYNC_BADGE[detail.sync_status])}>
                    {syncLabel(detail.sync_status)}
                  </Badge>
                </div>

                {detail.sync_error ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                    {detail.sync_error}
                  </div>
                ) : null}

                {detail.notes ? (
                  <div className="rounded-lg border p-3">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">Observações</div>
                    <div className="whitespace-pre-wrap text-sm">{detail.notes}</div>
                  </div>
                ) : null}

                {detail.meet_link ? (
                  <div className="rounded-lg border p-3">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">Meet</div>
                    <a className="text-sm text-primary hover:underline" href={detail.meet_link} target="_blank" rel="noreferrer">
                      Abrir link da consulta
                    </a>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={() => openEditDialog(detail)}>
                    Editar agendamento
                  </Button>
                  <Button variant="outline" onClick={() => void updateStatus(detail.id, 'confirmed')}>
                    Confirmar
                  </Button>
                  <Button variant="outline" onClick={() => void updateStatus(detail.id, 'attended')}>
                    Marcar compareceu
                  </Button>
                  <Button variant="outline" onClick={() => void updateStatus(detail.id, 'noshow')}>
                    Marcar não compareceu
                  </Button>
                </div>
              </div>
              <SheetFooter className="border-t">
                <div className="flex w-full items-center justify-between gap-2">
                  <Button variant="destructive" onClick={() => void cancelAppointment(detail.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancelar agendamento
                  </Button>
                  <Button variant="outline" onClick={() => setDetail(null)}>
                    Fechar
                  </Button>
                </div>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
