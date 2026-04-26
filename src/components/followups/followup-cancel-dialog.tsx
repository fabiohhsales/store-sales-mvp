'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { FollowupConversation } from '@/types/followup'

interface Props {
  open: boolean
  conversation: FollowupConversation | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function FollowupCancelDialog({
  open,
  conversation,
  submitting,
  onOpenChange,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar cadencia</DialogTitle>
          <DialogDescription>
            {conversation
              ? `A cadencia ${conversation.cadence_type} de ${conversation.contact_name} sera bloqueada de forma persistente.`
              : 'A cadencia selecionada sera bloqueada de forma persistente.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Cancelando...' : 'Confirmar cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
