'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Calendar, Pencil, Check, X, Loader2, ExternalLink } from 'lucide-react'

type CalendarMode = 'google_shared' | 'google_oauth' | 'native'

const modeLabels: Record<CalendarMode, string> = {
  google_shared: 'Google (conta central Sales Tec)',
  google_oauth: 'Google (conta própria do cliente)',
  native: 'Desativado',
}

interface GoogleReconnectProps {
  clientId: string
  currentEmail?: string | null
  currentCalendarMode?: CalendarMode | null
  currentCalendarId?: string | null
}

export function GoogleReconnect({ clientId, currentEmail, currentCalendarMode, currentCalendarId }: GoogleReconnectProps) {
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState(currentEmail ?? '')
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(currentCalendarMode ?? 'google_shared')
  const [calendarId, setCalendarId] = useState(currentCalendarId ?? 'primary')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setEmail(currentEmail ?? '')
    setCalendarMode(currentCalendarMode ?? 'google_shared')
    setCalendarId(currentCalendarId ?? 'primary')
  }, [currentEmail, currentCalendarMode, currentCalendarId])

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/calendar-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_email: email,
          calendar_mode: calendarMode,
          calendar_id: calendarId,
        }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Configurações de calendário atualizadas!')
      setEditing(false)
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setEmail(currentEmail ?? '')
    setCalendarMode(currentCalendarMode ?? 'google_shared')
    setCalendarId(currentCalendarId ?? 'primary')
  }

  const isDisabled = calendarMode === 'native'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Google Calendar
          </CardTitle>
          {!editing && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Modo do calendário</label>
              <Select value={calendarMode} onValueChange={(v) => setCalendarMode(v as CalendarMode)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isDisabled && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email do profissional (convites)</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@profissional.com"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">ID do calendário</label>
                  <Input
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                    placeholder="primary"
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">Use &quot;primary&quot; para o calendário principal ou cole o ID de um calendário específico.</p>
                </div>
              </>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={loading} className="gap-1.5">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Modo</span>
              <span className="text-sm font-medium">{modeLabels[calendarMode]}</span>
            </div>
            {!isDisabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Email convite</span>
                  <span className="text-sm">{email || <span className="text-muted-foreground italic">não configurado</span>}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Calendário</span>
                  <span className="text-sm font-mono text-xs">{calendarId || 'primary'}</span>
                </div>

                {/* Status de autorização + botão OAuth */}
                {calendarMode === 'google_oauth' && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">Autorização</span>
                    {email ? (
                      <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                        Conectado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Não autorizado
                      </Badge>
                    )}
                  </div>
                )}
                {calendarMode === 'google_oauth' && !email && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 mt-1"
                    onClick={() => { window.location.href = `/api/auth/google/${clientId}` }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Autorizar Google Calendar
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
