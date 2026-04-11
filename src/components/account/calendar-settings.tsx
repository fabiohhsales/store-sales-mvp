'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Calendar, Pencil, Check, X, Loader2 } from 'lucide-react'

type CalendarMode = 'google_shared' | 'google_oauth' | 'native'

const modeLabels: Record<CalendarMode | 'null', string> = {
  google_shared: 'Google (conta central)',
  google_oauth: 'Google (conta própria)',
  native: 'Desativado',
  null: 'Não configurado',
}

interface CalendarSettingsProps {
  clientId: string
}

export function CalendarSettings({ clientId }: CalendarSettingsProps) {
  const [config, setConfig] = useState<{
    calendar_mode: CalendarMode | null
    calendar_id: string | null
    google_email: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Draft state
  const [emailDraft, setEmailDraft] = useState('')
  const [calendarIdDraft, setCalendarIdDraft] = useState('primary')

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch(`/api/clients/${clientId}/calendar-config`)
        if (res.ok) {
          const data = await res.json()
          setConfig(data)
          setEmailDraft(data.google_email ?? '')
          setCalendarIdDraft(data.calendar_id ?? 'primary')
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [clientId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/calendar-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_email: emailDraft,
          calendar_id: calendarIdDraft,
        }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      setConfig((prev) => prev ? { ...prev, google_email: emailDraft || null, calendar_id: calendarIdDraft || 'primary' } : prev)
      toast.success('Configurações de calendário salvas!')
      setEditing(false)
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setEmailDraft(config?.google_email ?? '')
    setCalendarIdDraft(config?.calendar_id ?? 'primary')
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando configurações de calendário...</span>
        </div>
      </div>
    )
  }

  const mode = config?.calendar_mode ?? null
  const isActive = mode === 'google_shared' || mode === 'google_oauth'

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Google Calendar</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isActive ? 'text-success' : 'text-warning'}`}>
            {modeLabels[mode ?? 'null']}
          </span>
          {!editing && isActive && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!isActive && (
        <p className="text-xs text-muted-foreground">
          O calendário não está ativo para esta conta. Entre em contato com o suporte para ativar.
        </p>
      )}

      {isActive && !editing && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Email do profissional</span>
            <span>{config?.google_email || <span className="text-muted-foreground italic text-xs">não configurado</span>}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Calendário</span>
            <span className="font-mono text-xs">{config?.calendar_id || 'primary'}</span>
          </div>
        </div>
      )}

      {isActive && editing && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email do profissional (recebe convites)</label>
            <Input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="email@profissional.com"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ID do calendário</label>
            <Input
              value={calendarIdDraft}
              onChange={(e) => setCalendarIdDraft(e.target.value)}
              placeholder="primary"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
