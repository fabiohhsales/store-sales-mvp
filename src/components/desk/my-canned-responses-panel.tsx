'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CannedResponse {
  id: string
  shortcut: string
  content: string
}

interface Props {
  clientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function normalizeShortcut(v: string) {
  return v.replace(/^\/+/, '').toLowerCase().replace(/\s+/g, '_')
}

export function MyCannedResponsesPanel({ clientId, open, onOpenChange }: Props) {
  const [items, setItems] = useState<CannedResponse[]>([])
  const [loading, setLoading] = useState(false)

  // Criar
  const [createOpen, setCreateOpen] = useState(false)
  const [newShortcut, setNewShortcut] = useState('')
  const [newContent, setNewContent] = useState('')
  const [creating, setCreating] = useState(false)

  // Editar
  const [editItem, setEditItem] = useState<CannedResponse | null>(null)
  const [editShortcut, setEditShortcut] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Deletar
  const [deleteItem, setDeleteItem] = useState<CannedResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/desk/my-canned-responses?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data) ? data : [])
      }
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function handleCreate() {
    if (!newShortcut.trim() || !newContent.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/desk/my-canned-responses?client_id=${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut: newShortcut.trim(), content: newContent.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Erro ao criar atalho')
      setItems((prev) =>
        [...prev, data as CannedResponse].sort((a, b) => a.shortcut.localeCompare(b.shortcut))
      )
      setNewShortcut('')
      setNewContent('')
      setCreateOpen(false)
      toast.success('Atalho pessoal criado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar atalho')
    } finally {
      setCreating(false)
    }
  }

  function openEdit(item: CannedResponse) {
    setEditItem(item)
    setEditShortcut(item.shortcut)
    setEditContent(item.content)
  }

  async function handleSave() {
    if (!editItem || !editShortcut.trim() || !editContent.trim()) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/desk/my-canned-responses/${editItem.id}?client_id=${clientId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shortcut: editShortcut.trim(), content: editContent.trim() }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Erro ao salvar atalho')
      setItems((prev) =>
        prev
          .map((r) => (r.id === editItem.id ? (data as CannedResponse) : r))
          .sort((a, b) => a.shortcut.localeCompare(b.shortcut))
      )
      setEditItem(null)
      toast.success('Atalho atualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar atalho')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteItem) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/desk/my-canned-responses/${deleteItem.id}?client_id=${clientId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Erro ao excluir atalho')
      }
      setItems((prev) => prev.filter((r) => r.id !== deleteItem.id))
      setDeleteItem(null)
      toast.success('Atalho excluído')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir atalho')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Zap size={15} className="text-primary" />
              Meus atalhos pessoais
            </SheetTitle>
            <SheetDescription className="text-xs">
              Visíveis só para você. Use <strong>/atalho</strong> no chat para inserir.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center justify-between px-6 py-3 border-b border-border">
            <span className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? 'atalho' : 'atalhos'}
            </span>
            <Button size="sm" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus size={12} className="mr-1" />
              Novo atalho
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Loader2 size={13} className="animate-spin" />
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                <Zap size={28} className="text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhum atalho pessoal ainda.</p>
                <p className="text-xs text-muted-foreground/60">
                  Crie atalhos que só você vê no chat.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary">/{item.shortcut}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {item.content}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteItem(item)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog: Criar */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo atalho pessoal</DialogTitle>
            <DialogDescription>Visível só para você no chat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Atalho</label>
              <Input
                placeholder="ex: consulta"
                value={newShortcut}
                onChange={(e) => setNewShortcut(normalizeShortcut(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
              {newShortcut && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Será usado como <strong>/{newShortcut}</strong>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Conteúdo</label>
              <Textarea
                placeholder="Texto da resposta rápida…"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newShortcut.trim() || !newContent.trim() || creating}
            >
              {creating && <Loader2 size={13} className="animate-spin mr-1" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar atalho</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Atalho</label>
              <Input
                value={editShortcut}
                onChange={(e) => setEditShortcut(normalizeShortcut(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              />
              {editShortcut && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Será usado como <strong>/{editShortcut}</strong>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Conteúdo</label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!editShortcut.trim() || !editContent.trim() || saving}
            >
              {saving && <Loader2 size={13} className="animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={!!deleteItem} onOpenChange={(o) => { if (!o) setDeleteItem(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir atalho?</DialogTitle>
            <DialogDescription>
              O atalho <strong>/{deleteItem?.shortcut}</strong> será removido permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 size={13} className="animate-spin mr-1" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
