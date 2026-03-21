'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Pause, Play, Pencil, Trash2 } from 'lucide-react'
import type { PanelClient } from '@/types/database'

interface ClientActionsProps {
  client: PanelClient
}

export function ClientActions({ client }: ClientActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isActive = client.status === 'active'
  const isPaused = client.status === 'paused'

  const handleToggleStatus = async () => {
    setLoading(true)
    const newStatus = isActive ? 'paused' : 'active'

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error('Erro ao atualizar status')

      toast.success(newStatus === 'paused' ? 'Cliente pausado' : 'Cliente ativado')
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao deletar')

      toast.success('Cliente deletado')
      router.push('/clients')
    } catch {
      toast.error('Erro ao deletar cliente')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/clients/${client.id}/edit`)}
      >
        <Pencil className="mr-2 h-4 w-4" />
        Editar
      </Button>

      {(isActive || isPaused) && (
        <Dialog>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
            {isActive ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pausar
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Ativar
              </>
            )}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isActive ? 'Pausar cliente?' : 'Ativar cliente?'}
              </DialogTitle>
              <DialogDescription>
                {isActive
                  ? 'O bot deixará de responder mensagens deste cliente.'
                  : 'O bot voltará a responder mensagens deste cliente.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                Cancelar
              </DialogClose>
              <Button onClick={handleToggleStatus} disabled={loading}>
                {loading ? 'Processando...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog>
        <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-destructive/30 bg-background px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10">
          <Trash2 className="mr-2 h-4 w-4" />
          Apagar
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar cliente?</DialogTitle>
            <DialogDescription>
              Isso vai remover permanentemente <strong>{client.name}</strong>, incluindo
              a instância do WhatsApp, configuração do Google Calendar e todas as
              configurações do bot. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
              Cancelar
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Apagando...' : 'Apagar permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
