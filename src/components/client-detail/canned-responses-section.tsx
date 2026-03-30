'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2, Zap } from 'lucide-react'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface CannedResponsesSectionProps {
  clientId: string
}

interface CannedResponse {
  id: string
  shortcut: string
  content: string
  created_at: string
  updated_at: string
}

export function CannedResponsesSection({ clientId }: CannedResponsesSectionProps) {
  const [responses, setResponses] = useState<CannedResponse[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog de criação
  const [createOpen, setCreateOpen] = useState(false)
  const [createShortcut, setCreateShortcut] = useState('')
  const [createContent, setCreateContent] = useState('')
  const [creating, setCreating] = useState(false)

  // Dialog de edição
  const [editTarget, setEditTarget] = useState<CannedResponse | null>(null)
  const [editShortcut, setEditShortcut] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Dialog de confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/canned-responses`)
      if (res.ok) {
        const data = await res.json()
        setResponses(Array.isArray(data) ? data : [])
      }
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    const shortcut = createShortcut.trim().toLowerCase().replace(/^\/+/, '')
    const content = createContent.trim()
    if (!shortcut || !content) return
    setCreating(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/canned-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut, content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao criar')
      setResponses((prev) => [...prev, data as CannedResponse].sort((a, b) => a.shortcut.localeCompare(b.shortcut)))
      setCreateShortcut('')
      setCreateContent('')
      setCreateOpen(false)
      toast.success(`Resposta rápida "/${shortcut}" criada`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar resposta rápida')
    } finally {
      setCreating(false)
    }
  }

  function openEdit(r: CannedResponse) {
    setEditTarget(r)
    setEditShortcut(r.shortcut)
    setEditContent(r.content)
  }

  async function handleSave() {
    if (!editTarget) return
    const shortcut = editShortcut.trim().toLowerCase().replace(/^\/+/, '')
    const content = editContent.trim()
    if (!shortcut || !content) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/canned-responses/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut, content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao salvar')
      setResponses((prev) =>
        prev.map((r) => r.id === editTarget.id ? (data as CannedResponse) : r)
            .sort((a, b) => a.shortcut.localeCompare(b.shortcut))
      )
      setEditTarget(null)
      toast.success('Resposta rápida atualizada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar resposta rápida')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/canned-responses/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) throw new Error('Erro ao remover')
      setResponses((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success(`Resposta rápida "/${deleteTarget.shortcut}" removida`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover resposta rápida')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap size={15} className="text-primary" />
                Respostas Rápidas
              </CardTitle>
              <CardDescription>
                Atalhos de texto para os operadores usarem no chat. Digite <code className="text-xs bg-muted px-1 rounded">/atalho</code> no campo de mensagem para inserir.
              </CardDescription>
            </div>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus size={14} className="mr-1.5" />
                Nova resposta
              </Button>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Carregando...
            </div>
          ) : responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Zap size={28} className="text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma resposta rápida cadastrada.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Crie atalhos para mensagens frequentes dos operadores.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Atalho</TableHead>
                  <TableHead>Conteúdo</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
                        /{r.shortcut}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      <span className="line-clamp-2">{r.content}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(r)}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(r)}
                          title="Remover"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog — criar */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!creating) setCreateOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova resposta rápida</DialogTitle>
            <DialogDescription>
              O atalho deve ser único por cliente. O operador digita <strong>/atalho</strong> para usar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cr-shortcut">Atalho</Label>
              <div className="flex items-center gap-0">
                <span className="flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground">/</span>
                <Input
                  id="cr-shortcut"
                  value={createShortcut}
                  onChange={(e) => setCreateShortcut(e.target.value.replace(/\s/g, '_').replace(/^\/+/, ''))}
                  placeholder="ex: boas_vindas"
                  className="rounded-l-none"
                  disabled={creating}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-content">Conteúdo da mensagem</Label>
              <Textarea
                id="cr-content"
                value={createContent}
                onChange={(e) => setCreateContent(e.target.value)}
                placeholder="Digite o texto que será inserido ao usar este atalho…"
                rows={4}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!createShortcut.trim() || !createContent.trim() || creating}>
              {creating ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Plus size={14} className="mr-1.5" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — editar */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!saving && !open) setEditTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar resposta rápida</DialogTitle>
            <DialogDescription>
              Altere o atalho ou o conteúdo da resposta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-shortcut">Atalho</Label>
              <div className="flex items-center gap-0">
                <span className="flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground">/</span>
                <Input
                  id="edit-shortcut"
                  value={editShortcut}
                  onChange={(e) => setEditShortcut(e.target.value.replace(/\s/g, '_').replace(/^\/+/, ''))}
                  placeholder="ex: boas_vindas"
                  className="rounded-l-none"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-content">Conteúdo da mensagem</Label>
              <Textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!editShortcut.trim() || !editContent.trim() || saving}>
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — confirmar exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!deleting && !open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover resposta rápida?</DialogTitle>
            <DialogDescription>
              O atalho <strong>/{deleteTarget?.shortcut}</strong> será removido permanentemente.
              Os operadores não poderão mais usá-lo no chat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
