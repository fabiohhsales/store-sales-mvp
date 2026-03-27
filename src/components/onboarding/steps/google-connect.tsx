'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Calendar } from 'lucide-react'

interface CalendarSetupStepProps {
  clientId: string
  onComplete: () => void
  onSkip: () => void
}

const CALENDAR_COLORS = [
  { value: '1', label: 'Lavanda' },
  { value: '2', label: 'Sálvia' },
  { value: '3', label: 'Uva' },
  { value: '4', label: 'Flamingo' },
  { value: '5', label: 'Banana' },
  { value: '6', label: 'Tangerina' },
  { value: '7', label: 'Pavão' },
  { value: '8', label: 'Grafite' },
  { value: '9', label: 'Mirtilo' },
  { value: '10', label: 'Manjericão' },
  { value: '11', label: 'Tomate' },
]

export function GoogleConnectStep({ clientId, onComplete, onSkip }: CalendarSetupStepProps) {
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [titleTemplate, setTitleTemplate] = useState('')
  const [descTemplate, setDescTemplate] = useState('')
  const [createMeet, setCreateMeet] = useState(false)
  const [invitePatient, setInvitePatient] = useState(false)
  const [colorId, setColorId] = useState('')

  const handleSave = async () => {
    setLoading(true)
    try {
      // Salva email/calendar_id no panel_google_config
      const calRes = await fetch(`/api/clients/${clientId}/calendar-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_email: inviteEmail }),
      })
      if (!calRes.ok) throw new Error('Erro ao salvar configuração de calendário')

      // Salva templates e opções no panel_bot_config
      const botRes = await fetch('/api/bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          calendar_event_title_template: titleTemplate || null,
          calendar_event_description_template: descTemplate || null,
          calendar_create_meet_link: createMeet,
          calendar_send_invite_to_patient: invitePatient,
          calendar_color_id: colorId || null,
        }),
      })
      if (!botRes.ok) throw new Error('Erro ao salvar configurações do evento')

      toast.success('Configurações de agenda salvas!')
      onComplete()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Configurações de Agenda
        </CardTitle>
        <CardDescription>
          Configure como os eventos serão criados no Google Calendar da Sales Tec. O profissional receberá convites automaticamente para cada consulta agendada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="invite_email">Email do profissional para convites</Label>
          <Input
            id="invite_email"
            type="email"
            placeholder="doutor@clinica.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Este email receberá um convite do Google Calendar para cada consulta agendada.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title_template">Título do evento</Label>
          <Input
            id="title_template"
            placeholder="Consulta {service_name} — {patient_name}"
            value={titleTemplate}
            onChange={(e) => setTitleTemplate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Variáveis: {'{service_name}'}, {'{patient_name}'}, {'{professional_name}'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="desc_template">Descrição do evento</Label>
          <Textarea
            id="desc_template"
            placeholder={'Paciente: {patient_name}\nTelefone: {patient_phone}\nServiço: {service_name}'}
            value={descTemplate}
            onChange={(e) => setDescTemplate(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="create_meet"
              checked={createMeet}
              onCheckedChange={setCreateMeet}
            />
            <Label htmlFor="create_meet">Gerar link do Google Meet automaticamente</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="invite_patient"
              checked={invitePatient}
              onCheckedChange={setInvitePatient}
            />
            <Label htmlFor="invite_patient">Enviar convite por email para o paciente</Label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Cor dos eventos</Label>
          <Select value={colorId} onValueChange={setColorId}>
            <SelectTrigger>
              <SelectValue placeholder="Padrão do calendário" />
            </SelectTrigger>
            <SelectContent>
              {CALENDAR_COLORS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={loading}>
            Pular por enquanto
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar e Continuar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
