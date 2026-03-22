'use client'

import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '@/types/database'

interface HealthIndicatorProps {
  instanceName: string | null | undefined
  initialStatus?: ConnectionStatus
}

const statusConfig = {
  open: { label: 'Conectado', online: true },
  connecting: { label: 'Conectando', online: false },
  disconnected: { label: 'Desconectado', online: false },
  error: { label: 'Erro', online: false },
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
    <div className="flex items-center gap-1.5">
      <span className={`connection-dot ${config.online ? 'online' : 'offline'}`} />
      <span className="text-sm text-muted-foreground">{config.label}</span>
    </div>
  )
}
