'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChatwootDiagnosticProps {
  clientId: string
  accountId: number | null
  hasToken: boolean
}

export function ChatwootDiagnostic({ clientId, accountId, hasToken }: ChatwootDiagnosticProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    repaired: boolean
    action: string
    panel_whatsapp_config: { chatwoot_account_id: number | null; has_token: boolean }
    panel_clients: { chatwoot_account_id: number | null; has_token: boolean }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isHealthy = !!accountId && hasToken

  async function handleRepair() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/repair-chatwoot`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao diagnosticar')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        {isHealthy ? (
          <ShieldCheck className="h-5 w-5 shrink-0 text-green-500 mt-0.5" />
        ) : (
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Diagnóstico Chatwoot</p>
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              Account ID:{' '}
              <span className={accountId ? 'text-foreground font-mono' : 'text-destructive'}>
                {accountId ?? 'não configurado'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Token:{' '}
              <span className={hasToken ? 'text-foreground' : 'text-destructive'}>
                {hasToken ? '••••••••' : 'não configurado'}
              </span>
            </p>
          </div>
        </div>
        {!isHealthy && (
          <Button size="sm" variant="outline" onClick={handleRepair} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reparar'}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
          <p className={result.repaired ? 'text-green-600' : 'text-muted-foreground'}>
            {result.repaired ? '✓ Reparado' : 'Sem reparo'} — {result.action}
          </p>
          <p className="text-muted-foreground">
            panel_clients: account={result.panel_clients.chatwoot_account_id ?? '—'} token={result.panel_clients.has_token ? '✓' : '✗'}
            {' | '}
            panel_whatsapp_config: account={result.panel_whatsapp_config.chatwoot_account_id ?? '—'} token={result.panel_whatsapp_config.has_token ? '✓' : '✗'}
          </p>
        </div>
      )}
    </div>
  )
}
