'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ConnectionStatus } from '@/types/database'

interface HealthIndicatorProps {
  instanceName: string | null | undefined
  initialStatus?: ConnectionStatus
}

const statusConfig = {
  open: { color: 'bg-green-500', label: 'Conectado' },
  connecting: { color: 'bg-yellow-500', label: 'Conectando' },
  disconnected: { color: 'bg-red-500', label: 'Desconectado' },
  error: { color: 'bg-red-500', label: 'Erro' },
} as const

export function HealthIndicator({ instanceName, initialStatus = 'disconnected' }: HealthIndicatorProps) {
  const [status, setStatus] = useState<ConnectionStatus | 'error'>(initialStatus)

  useEffect(() => {
    if (!instanceName) return

    let mounted = true

    async function check() {
      try {
        const res = await fetch(`/api/health/${instanceName}`)
        const data = await res.json()
        if (!mounted) return

        if (data.state === 'open') setStatus('open')
        else if (data.state === 'connecting') setStatus('connecting')
        else setStatus('disconnected')
      } catch {
        if (mounted) setStatus('error')
      }
    }

    check()
    const interval = setInterval(check, 30000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [instanceName])

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2 w-2 rounded-full', config.color)} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  )
}
