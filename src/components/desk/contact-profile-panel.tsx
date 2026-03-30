'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarDays, Clock3, ExternalLink, History, Phone, Save, UserRound } from 'lucide-react'

interface ContactProfilePanelProps {
  conversationId: string
  loading: boolean
  saving: boolean
  error: string | null
  profile: ContactProfileData | null
  nameDraft: string
  customDataDraft: Record<string, string>
  onNameDraftChange: (value: string) => void
  onCustomDataDraftChange: (key: string, value: string) => void
  onSave: () => void
  className?: string
}

export interface ContactProfileData {
  contact: {
    id: string
    name: string | null
    phone_number: string | null
    identifier: string | null
    custom_data: Record<string, unknown> | null
    intake_completed_at: string | null
    created_at: string | null
  }
  conversations: Array<{
    id: string
    stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved' | null
    status: string | null
    summary: string | null
    last_incoming_at: string | null
    created_at: string | null
  }>
  appointments: Array<{
    id: string
    conversation_id: string | null
    title: string | null
    start_at: string
    end_at: string | null
    modality: string | null
    status: string | null
    meet_link: string | null
  }>
}

const STAGE_LABELS: Record<string, string> = {
  bot_triage: 'Com o bot',
  awaiting_human: 'Aguardando humano',
  in_service: 'Em atendimento',
  resolved: 'Finalizada',
}

function formatDateTime(date: string | null): string {
  if (!date) return '-'
  try {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

function formatRelative(date: string | null): string {
  if (!date) return '-'
  try {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  } catch {
    return '-'
  }
}

export function ContactProfilePanel({
  conversationId,
  loading,
  saving,
  error,
  profile,
  nameDraft,
  customDataDraft,
  onNameDraftChange,
  onCustomDataDraftChange,
  onSave,
  className,
}: ContactProfilePanelProps) {
  return (
    <div className={`flex h-full flex-col overflow-hidden ${className ?? ''}`.trim()}>
      <div className="border-b border-border px-4 py-3 bg-card/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Perfil do contato</p>
            <p className="text-xs text-muted-foreground">Historico, intake e agendamentos desta conversa.</p>
          </div>
          <Badge variant="outline" className="shrink-0">{conversationId.slice(0, 8)}</Badge>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando perfil do contato...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : !profile ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum perfil encontrado para esta conversa.
          </div>
        ) : (
          <>
            <section className="space-y-4 rounded-xl border bg-background p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Dados basicos</p>
                  <p className="text-xs text-muted-foreground">Edite o nome e revise os dados capturados no atendimento.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-name">Nome</Label>
                <Input
                  id="contact-name"
                  value={nameDraft}
                  onChange={(e) => onNameDraftChange(e.target.value)}
                  placeholder="Nome do paciente"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Telefone</p>
                  <p className="flex items-center gap-2 text-sm text-foreground">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {profile.contact.phone_number || '-'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Identifier</p>
                  <p className="text-sm text-foreground break-all">{profile.contact.identifier || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={profile.contact.intake_completed_at ? 'default' : 'outline'}>
                  {profile.contact.intake_completed_at ? 'Intake concluido' : 'Intake pendente'}
                </Badge>
                <Badge variant="outline">Criado em {formatDateTime(profile.contact.created_at)}</Badge>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Campos do intake</p>
                  <p className="text-xs text-muted-foreground">As alteracoes sobrescrevem apenas as chaves enviadas.</p>
                </div>

                {Object.keys(customDataDraft).length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    Nenhum campo de intake disponivel para edicao.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(customDataDraft).map(([key, value]) => (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={`custom-${key}`}>{key.replace(/_/g, ' ')}</Label>
                        <Input
                          id={`custom-${key}`}
                          value={value}
                          onChange={(e) => onCustomDataDraftChange(key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={onSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar perfil
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border bg-background p-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Historico de conversas</p>
                  <p className="text-xs text-muted-foreground">Ultimas conversas deste contato neste cliente.</p>
                </div>
              </div>

              {profile.conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
              ) : (
                <div className="space-y-2">
                  {profile.conversations.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 ${item.id === conversationId ? 'border-primary/30 bg-primary/5' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={item.id === conversationId ? 'default' : 'outline'}>
                            {item.id === conversationId ? 'Atual' : 'Historico'}
                          </Badge>
                          <Badge variant="outline">{item.stage ? (STAGE_LABELS[item.stage] || item.stage) : 'Sem etapa'}</Badge>
                          {item.status ? <Badge variant="outline">{item.status}</Badge> : null}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{formatRelative(item.last_incoming_at || item.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground/90">
                        {item.summary?.trim() || 'Sem resumo de triagem.'}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">Criada em {formatDateTime(item.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-xl border bg-background p-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Agendamentos</p>
                  <p className="text-xs text-muted-foreground">Ultimos compromissos vinculados a este contato.</p>
                </div>
              </div>

              {profile.appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {profile.appointments.map((appointment) => (
                    <div key={appointment.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{appointment.title || 'Agendamento sem titulo'}</p>
                        {appointment.status ? <Badge variant="outline">{appointment.status}</Badge> : null}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>{formatDateTime(appointment.start_at)}</span>
                      </div>
                      {appointment.modality ? (
                        <p className="mt-1 text-xs text-muted-foreground">Modalidade: {appointment.modality}</p>
                      ) : null}
                      {appointment.meet_link ? (
                        <a
                          href={appointment.meet_link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Abrir Meet
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}