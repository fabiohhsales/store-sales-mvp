'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Calendar, Pencil, Check, X } from 'lucide-react'

interface GoogleReconnectProps {
  clientId: string
  currentEmail?: string | null
}

export function GoogleReconnect({ clientId, currentEmail }: GoogleReconnectProps) {
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState(currentEmail ?? '')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/calendar-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_email: email }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Email de convite atualizado!')
      setEditing(false)
    } catch {
      toast.error('Erro ao salvar email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Conta central da Sales Tec. O profissional recebe convites por email a cada agendamento.
        </p>

        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@profissional.com"
              className="h-8 text-sm"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSave} disabled={loading}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(false); setEmail(currentEmail ?? '') }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {email ? (
                <span>Convite para: <strong>{email}</strong></span>
              ) : (
                <span className="text-muted-foreground">Nenhum email configurado</span>
              )}
            </p>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
