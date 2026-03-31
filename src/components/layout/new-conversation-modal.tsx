'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquarePlus, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface NewConversationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (payload: { conversation_id: string; contact_id: string }) => void
  clientId?: string
}

export function NewConversationModal({ open, onOpenChange, onSuccess, clientId }: NewConversationModalProps) {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim() || !message.trim()) return

    setSending(true)
    try {
      const url = clientId
        ? `/api/conversations/start?client_id=${clientId}`
        : '/api/conversations/start'

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), message: message.trim() }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar conversa')

      toast.success('Conversa iniciada com sucesso!')
      if (data?.conversation_id && data?.contact_id && onSuccess) {
        onSuccess({
          conversation_id: data.conversation_id,
          contact_id: data.contact_id,
        })
      }
      setPhone('')
      setMessage('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar conversa')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Nova Conversa
          </DialogTitle>
          <DialogDescription>
            Envie uma mensagem para iniciar uma conversa pelo WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="conv-phone" className="text-sm font-medium text-foreground">
              Telefone (com DDD)
            </label>
            <Input
              id="conv-phone"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={sending}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="conv-message" className="text-sm font-medium text-foreground">
              Mensagem
            </label>
            <textarea
              id="conv-message"
              placeholder="Olá! Como posso ajudar?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={sending || !phone.trim() || !message.trim()}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
