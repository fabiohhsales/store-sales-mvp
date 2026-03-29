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
import type { ChatwootAgentRole } from '@/types/api'
import { PlusIcon, TrashIcon } from 'lucide-react'

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

interface OnboardingChatwootUser {
  name: string
  email: string
  role: ChatwootAgentRole
}

const DEFAULT_CHATWOOT_USER: OnboardingChatwootUser = {
  name: '',
  email: '',
  role: 'agent',
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function BusinessDataStep({ onComplete }: BusinessDataStepProps) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    owner_name: '',
    email: '',
    phone: '',
    business_segment: '' as BusinessSegment | '',
  })
  const [chatwootUsers, setChatwootUsers] = useState<OnboardingChatwootUser[]>([])

  function addChatwootUser() {
    setChatwootUsers((prev) => [...prev, { ...DEFAULT_CHATWOOT_USER }])
  }

  function removeChatwootUser(index: number) {
    setChatwootUsers((prev) => prev.filter((_, i) => i !== index))
  }

  function updateChatwootUser(index: number, updates: Partial<OnboardingChatwootUser>) {
    setChatwootUsers((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.owner_name || !form.email) {
      toast.error('Preencha os campos obrigatórios')
      return
    }

    const normalizedUsers = chatwootUsers.map((user) => ({
      name: user.name.trim(),
      email: user.email.trim().toLowerCase(),
      role: user.role,
    }))

    const hasInvalidUser = normalizedUsers.some((user) => !user.name || !user.email || !isValidEmail(user.email))
    if (hasInvalidUser) {
      toast.error('Preencha nome e e-mail validos para todos os agentes adicionais')
      return
    }

    const uniqueEmails = new Set(normalizedUsers.map((user) => user.email))
    if (uniqueEmails.size !== normalizedUsers.length) {
      toast.error('Nao repita e-mails na lista de agentes adicionais')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          chatwoot_users: normalizedUsers,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar cliente')
      }

      const client = await res.json()
      if (client.chatwoot_provisioning?.ok === false) {
        toast.warning(`Cliente criado, mas o Chatwoot falhou: ${client.chatwoot_provisioning.error}`)
      } else {
        toast.success('Cliente criado com sucesso')
      }
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

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Agentes Chatwoot adicionais</Label>
                <p className="text-xs text-muted-foreground">
                  Esses usuarios serao provisionados no espaco do cliente durante a etapa de WhatsApp.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addChatwootUser}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Adicionar agente
              </Button>
            </div>

            {chatwootUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum agente adicional. Voce pode continuar sem preencher esta secao.
              </p>
            ) : (
              <div className="space-y-3">
                {chatwootUsers.map((user, index) => (
                  <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-4">
                      <Label htmlFor={`chatwoot-user-name-${index}`}>Nome</Label>
                      <Input
                        id={`chatwoot-user-name-${index}`}
                        placeholder="Maria Souza"
                        value={user.name}
                        onChange={(e) => updateChatwootUser(index, { name: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-4">
                      <Label htmlFor={`chatwoot-user-email-${index}`}>E-mail</Label>
                      <Input
                        id={`chatwoot-user-email-${index}`}
                        type="email"
                        placeholder="maria@clinica.com"
                        value={user.email}
                        onChange={(e) => updateChatwootUser(index, { email: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-3">
                      <Label htmlFor={`chatwoot-user-role-${index}`}>Papel</Label>
                      <Select
                        value={user.role}
                        onValueChange={(value) => updateChatwootUser(index, { role: value as ChatwootAgentRole })}
                      >
                        <SelectTrigger id={`chatwoot-user-role-${index}`}>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">agent</SelectItem>
                          <SelectItem value="administrator">administrator</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end sm:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeChatwootUser(index)}
                        aria-label={`Remover agente ${index + 1}`}
                      >
                        <TrashIcon className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
