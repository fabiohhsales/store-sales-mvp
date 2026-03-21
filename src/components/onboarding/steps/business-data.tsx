'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import type { BusinessSegment } from '@/types/database'

interface BusinessDataStepProps {
  onComplete: (clientId: string) => void
}

const segments: { value: BusinessSegment; label: string }[] = [
  { value: 'medicina', label: 'Medicina' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'estetica', label: 'Estética' },
  { value: 'outro', label: 'Outro' },
]

export function BusinessDataStep({ onComplete }: BusinessDataStepProps) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    owner_name: '',
    email: '',
    phone: '',
    business_segment: '' as BusinessSegment | '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.owner_name || !form.email) {
      toast.error('Preencha os campos obrigatórios')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar cliente')
      }

      const client = await res.json()
      toast.success('Cliente criado com sucesso')
      onComplete(client.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do Negócio</CardTitle>
        <CardDescription>
          Informações básicas do cliente que será onboardado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do negócio *</Label>
              <Input
                id="name"
                placeholder="Clínica Dr. Silva"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner_name">Nome do responsável *</Label>
              <Input
                id="owner_name"
                placeholder="Dr. João Silva"
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="joao@clinica.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                placeholder="(21) 99999-9999"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="segment">Segmento</Label>
            <Select
              value={form.business_segment}
              onValueChange={(value) =>
                setForm({ ...form, business_segment: value as BusinessSegment })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o segmento" />
              </SelectTrigger>
              <SelectContent>
                {segments.map((seg) => (
                  <SelectItem key={seg.value} value={seg.value}>
                    {seg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Próximo'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
