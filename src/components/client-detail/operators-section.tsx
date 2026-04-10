'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, PencilLine, RefreshCw, ShieldPlus, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface OperatorsSectionProps {
  clientId: string
}

interface OperatorRecord {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  created_at: string | null
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  try {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '-'
  }
}

function generatePassword(): string {
  const seed = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  return `${seed}Aa!9`
}

export function OperatorsSection({ clientId }: OperatorsSectionProps) {
  const [operators, setOperators] = useState<OperatorRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingOperator, setEditingOperator] = useState<OperatorRecord | null>(null)
  const [createForm, setCreateForm] = useState({
    display_name: '',
    email: '',
    password: '',
  })
  const [editDisplayName, setEditDisplayName] = useState('')

  const activeCount = useMemo(
    () => operators.filter((operator) => operator.is_active).length,
    [operators]
  )

  const loadOperators = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await fetch(`/api/clients/${clientId}/operators`, { cache: 'no-store' })
      const body = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao carregar operadores')
      }
      setOperators(Array.isArray(body) ? body as OperatorRecord[] : [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar operadores')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clientId])

  useEffect(() => {
    void loadOperators()
  }, [loadOperators])

  function resetCreateForm() {
    setCreateForm({
      display_name: '',
      email: '',
      password: '',
    })
  }

  function handleGeneratePassword() {
    const password = generatePassword()
    setCreateForm((prev) => ({ ...prev, password }))

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(password)
        .then(() => toast.success('Senha inicial gerada e copiada'))
        .catch(() => toast.success('Senha inicial gerada'))
      return
    }

    toast.success('Senha inicial gerada')
  }

  async function handleCreateOperator() {
    const email = createForm.email.trim().toLowerCase()
    const password = createForm.password.trim()
    const displayName = createForm.display_name.trim()

    if (!email || !password) {
      toast.error('Preencha e-mail e senha inicial')
      return
    }

    setCreateLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/operators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName || null,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao criar operador')
      }

      setOperators((prev) => [...prev, body as OperatorRecord])
      setCreateOpen(false)
      resetCreateForm()
      toast.success('Operador criado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar operador')
    } finally {
      setCreateLoading(false)
    }
  }

  function openEditDialog(operator: OperatorRecord) {
    setEditingOperator(operator)
    setEditDisplayName(operator.display_name ?? '')
  }

  async function handleSaveDisplayName() {
    if (!editingOperator) return

    setEditLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/operators/${editingOperator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editDisplayName.trim() || null }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao atualizar operador')
      }

      setOperators((prev) => prev.map((operator) => (
        operator.id === editingOperator.id ? body as OperatorRecord : operator
      )))
      setEditingOperator(null)
      setEditDisplayName('')
      toast.success('Nome do operador atualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar operador')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleToggleOperator(operator: OperatorRecord, nextChecked: boolean) {
    setTogglingId(operator.id)
    try {
      const res = await fetch(`/api/clients/${clientId}/operators/${operator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextChecked }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao atualizar status do operador')
      }

      setOperators((prev) => prev.map((item) => (
        item.id === operator.id ? body as OperatorRecord : item
      )))
      toast.success(nextChecked ? 'Operador ativado' : 'Operador desativado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar status do operador')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Operadores do Desk</CardTitle>
          <CardDescription>
            Crie acessos por cliente para o atendimento humano. A senha inicial precisa ser definida e compartilhada manualmente.
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <Badge variant="outline">{activeCount} ativos</Badge>
          <Badge variant="secondary">{operators.length} total</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadOperators(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Atualizar
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button type="button" size="sm" />}>
              <ShieldPlus className="mr-1 h-3.5 w-3.5" />
              Novo operador
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar operador</DialogTitle>
                <DialogDescription>
                  Esse acesso será vinculado apenas a este cliente no Desk.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="operator-display-name">Nome de exibição</Label>
                  <Input
                    id="operator-display-name"
                    placeholder="Ex.: Maria Souza"
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operator-email">E-mail</Label>
                  <Input
                    id="operator-email"
                    type="email"
                    placeholder="maria@clinica.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="operator-password">Senha inicial</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={handleGeneratePassword}>
                      Gerar senha
                    </Button>
                  </div>
                  <Input
                    id="operator-password"
                    type="text"
                    placeholder="Defina uma senha inicial"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Guarde a senha antes de criar o acesso. Ela nao pode ser recuperada por esta tela.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm() }}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleCreateOperator} disabled={createLoading}>
                  {createLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Criar operador
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando operadores...
          </div>
        ) : operators.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <UserRound className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum operador criado ainda</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Use esta secao para criar acessos dedicados ao Desk por cliente, separados dos agentes legados do Chatwoot.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operators.map((operator) => (
                <TableRow key={operator.id}>
                  <TableCell className="font-medium text-foreground">
                    {operator.display_name?.trim() || 'Sem nome'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{operator.email}</TableCell>
                  <TableCell>
                    <Badge variant={operator.is_active ? 'default' : 'outline'}>
                      {operator.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(operator.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={operator.is_active}
                          onCheckedChange={(checked) => handleToggleOperator(operator, !!checked)}
                          disabled={togglingId === operator.id}
                          size="sm"
                        />
                        <span>{operator.is_active ? 'Ativo' : 'Inativo'}</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEditDialog(operator)}>
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                        Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editingOperator} onOpenChange={(open) => {
        if (!open) {
          setEditingOperator(null)
          setEditDisplayName('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar operador</DialogTitle>
            <DialogDescription>
              Ajuste o nome exibido para a equipe neste cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-operator-name">Nome de exibição</Label>
            <Input
              id="edit-operator-name"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Ex.: Maria Souza"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingOperator(null)
                setEditDisplayName('')
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveDisplayName} disabled={editLoading}>
              {editLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar nome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}