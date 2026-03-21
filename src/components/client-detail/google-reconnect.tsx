'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Calendar, ExternalLink } from 'lucide-react'

interface GoogleReconnectProps {
  clientId: string
  currentEmail?: string | null
}

export function GoogleReconnect({ clientId, currentEmail }: GoogleReconnectProps) {
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/google?client_id=${clientId}`)
      if (!res.ok) throw new Error('Erro ao iniciar autenticação')
      const data = await res.json()
      window.location.href = data.url
    } catch {
      toast.error('Erro ao iniciar conexão com Google')
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {currentEmail && (
          <p className="text-sm text-muted-foreground">
            Conectado: <strong>{currentEmail}</strong>
          </p>
        )}
        <Button variant="outline" size="sm" onClick={handleConnect} disabled={loading}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {currentEmail ? 'Reconectar Google Calendar' : 'Conectar Google Calendar'}
        </Button>
      </CardContent>
    </Card>
  )
}
