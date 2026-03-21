'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Calendar, Check, ExternalLink } from 'lucide-react'

interface GoogleConnectStepProps {
  clientId: string
  onComplete: () => void
  onSkip: () => void
}

export function GoogleConnectStep({ clientId, onComplete, onSkip }: GoogleConnectStepProps) {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const googleStatus = searchParams.get('google')

  useEffect(() => {
    if (googleStatus === 'success') {
      toast.success('Google Calendar conectado!')
    }
  }, [googleStatus])

  const handleConnect = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/google?client_id=${clientId}`)
      if (!res.ok) throw new Error('Erro ao iniciar autenticação')
      const data = await res.json()
      window.location.href = data.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao conectar Google')
      setLoading(false)
    }
  }

  if (googleStatus === 'success') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-8 w-8" />
            </div>
            <p className="text-lg font-medium">Google Calendar conectado!</p>
            <Button onClick={onComplete}>Próximo</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Google Calendar
        </CardTitle>
        <CardDescription>
          Conecte o Google Calendar do profissional para gerenciar agendamentos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/50 p-4">
          <h4 className="mb-2 text-sm font-medium">O que será autorizado:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>- Ver eventos do calendário</li>
            <li>- Criar e editar eventos de agendamento</li>
            <li>- Verificar disponibilidade de horários</li>
          </ul>
        </div>

        <Button onClick={handleConnect} disabled={loading} className="w-full">
          <ExternalLink className="mr-2 h-4 w-4" />
          {loading ? 'Redirecionando...' : 'Conectar Google Calendar'}
        </Button>

        <div className="border-t pt-4">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Pular por enquanto
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
