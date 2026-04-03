'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { AgendaWorkspace } from '@/components/agenda/agenda-workspace'
import { Skeleton } from '@/components/ui/skeleton'

function AgendaEmbedContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [clientId, setClientId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return

    fetch(`/api/chatwoot/auth?token=${token}`)
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Token inválido')
        }
        return response.json()
      })
      .then((data) => {
        setClientId(data.client_id)
        setLoading(false)
      })
      .catch((authError) => {
        setError(authError.message)
        setLoading(false)
      })
  }, [token])

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Token não fornecido na URL</p>
          <p className="text-sm text-muted-foreground">
            Verifique o token de embed nas configurações do painel.
          </p>
        </div>
      </div>
    )
  }

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
  return <AgendaWorkspace clientId={clientId} token={token} initialView="list" />
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
