'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface EmbedToken {
  id: string
  token: string
  client_id: string
  label: string | null
  last_used_at: string | null
  created_at: string
  panel_clients: { name: string } | null
}

interface ClientOption {
  id: string
  name: string
}

export function EmbedTokensSection() {
  const [tokens, setTokens] = useState<EmbedToken[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newClientId, setNewClientId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/embed-tokens').then((r) => r.json()),
      fetch('/api/clients').then((r) => r.json()),
    ])
      .then(([tokenData, clientData]) => {
        setTokens(tokenData || [])
        setClients(
          (clientData as Record<string, unknown>[])
            .filter((c) => c.status === 'active' || c.status === 'paused')
            .map((c) => ({ id: c.id as string, name: c.name as string }))
        )
      })
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newClientId) {
      toast.error('Selecione um cliente')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/embed-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: newClientId, label: newLabel || null }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()

      // Adiciona com o nome do cliente
      const client = clients.find((c) => c.id === newClientId)
      setTokens((prev) => [
        { ...data, panel_clients: client ? { name: client.name } : null, last_used_at: null },
        ...prev,
      ])
      setDialogOpen(false)
      setNewLabel('')
      setNewClientId('')
      toast.success('Token criado')
    } catch {
      toast.error('Erro ao criar token')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch('/api/embed-tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      setTokens((prev) => prev.filter((t) => t.id !== id))
      toast.success('Token removido')
    } catch {
      toast.error('Erro ao remover token')
    }
  }

  function copyUrl(tokenValue: string, type: 'kanban' | 'agenda') {
    const url = `${window.location.origin}/chatwoot/${type}?token=${tokenValue}`
    navigator.clipboard.writeText(url)
    toast.success(`URL de ${type} copiada!`)
  }

  function maskToken(token: string): string {
    return `${token.slice(0, 8)}...${token.slice(-4)}`
  }

  if (loading) return null

  return (
    <div className="glass-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Embed Tokens (Chatwoot)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Tokens para embutir Pipeline e Agenda como Dashboard Apps no Chatwoot.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="h-4 w-4 mr-1" />
            Gerar Token
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gerar Embed Token</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={newClientId} onValueChange={(v) => { if (v !== null) setNewClientId(v) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label (opcional)</Label>
                <Input
                  placeholder="Ex: Kanban principal"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-5">
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum token criado ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{t.label || '-'}</TableCell>
                  <TableCell className="text-sm">
                    {t.panel_clients?.name || '-'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {maskToken(t.token)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.last_used_at
                      ? new Date(t.last_used_at).toLocaleDateString('pt-BR')
                      : 'Nunca'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyUrl(t.token, 'kanban')}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Kanban
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyUrl(t.token, 'agenda')}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Agenda
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
