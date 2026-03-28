'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { AgendaTable } from '@/components/agenda/agenda-table'
import { Skeleton } from '@/components/ui/skeleton'

function AgendaEmbedContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [clientId, setClientId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('Token não fornecido na URL')
      setLoading(false)
      return
    }

    fetch(`/api/chatwoot/auth?token=${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Token inválido')
        }
        return res.json()
      })
      .then((data) => {
        setClientId(data.client_id)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-sm text-muted-foreground">
            Verifique o token de embed nas configurações do painel.
          </p>
        </div>
      </div>
    )
  }

  if (!clientId) return null

  return <AgendaTable clientId={clientId} token={token!} />
}

export default function ChatwootAgendaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-64 w-full max-w-md" />
        </div>
      }
    >
      <AgendaEmbedContent />
    </Suspense>
  )
}
