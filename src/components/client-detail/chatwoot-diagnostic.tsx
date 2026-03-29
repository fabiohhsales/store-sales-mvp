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
  const [loadingRepair, setLoadingRepair] = useState(false)
  const [loadingProvision, setLoadingProvision] = useState(false)
  const [localAccountId, setLocalAccountId] = useState<number | null>(accountId)
  const [localHasToken, setLocalHasToken] = useState<boolean>(hasToken)
  const [result, setResult] = useState<{
    repaired: boolean
    action: string
    panel_whatsapp_config: { chatwoot_account_id: number | null; has_token: boolean }
    panel_clients: { chatwoot_account_id: number | null; has_token: boolean }
  } | null>(null)
  const [provisionResult, setProvisionResult] = useState<{
    message: string
    account_id: number | null
    copied_to_whatsapp_config: boolean
    ignored_agents: number
    agents_summary: { created: string[]; existing: string[]; failed: Array<{ email: string; reason: string }> }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isHealthy = !!localAccountId && localHasToken

  async function handleRepair() {
    setLoadingRepair(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/repair-chatwoot`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao diagnosticar')
      setResult(data)
      setLocalAccountId(data.panel_clients.chatwoot_account_id ?? data.panel_whatsapp_config.chatwoot_account_id ?? null)
      setLocalHasToken(!!(data.panel_clients.has_token || data.panel_whatsapp_config.has_token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoadingRepair(false)
    }
  }

  async function handleProvision() {
    setLoadingProvision(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/provision-chatwoot`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao provisionar Chatwoot')

      setProvisionResult({
        message: data.message ?? 'Chatwoot provisionado com sucesso',
        account_id: data.account_id ?? null,
        copied_to_whatsapp_config: !!data.copied_to_whatsapp_config,
        ignored_agents: Number(data.ignored_agents ?? 0),
        agents_summary: data.agents_summary ?? { created: [], existing: [], failed: [] },
      })

      setLocalAccountId(data.account_id ?? null)
      setLocalHasToken(!!data.token_configured)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoadingProvision(false)
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
              <span className={localAccountId ? 'text-foreground font-mono' : 'text-destructive'}>
                {localAccountId ?? 'não configurado'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Token:{' '}
              <span className={localHasToken ? 'text-foreground' : 'text-destructive'}>
                {localHasToken ? '••••••••' : 'não configurado'}
              </span>
            </p>
          </div>
        </div>
        {!isHealthy && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRepair} disabled={loadingRepair || loadingProvision}>
              {loadingRepair ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reparar'}
            </Button>
            <Button size="sm" onClick={handleProvision} disabled={loadingProvision || loadingRepair}>
              {loadingProvision ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Provisionar'}
            </Button>
          </div>
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

      {provisionResult && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
          <p className="text-green-600">✓ {provisionResult.message}</p>
          <p className="text-muted-foreground">
            account={provisionResult.account_id ?? '—'}
            {' | '}
            copiado p/ whatsapp_config={provisionResult.copied_to_whatsapp_config ? 'sim' : 'não'}
            {' | '}
            agentes ignorados={provisionResult.ignored_agents}
          </p>
          <p className="text-muted-foreground">
            agentes: criados={provisionResult.agents_summary.created.length}, existentes={provisionResult.agents_summary.existing.length}, falhas={provisionResult.agents_summary.failed.length}
          </p>
        </div>
      )}
    </div>
  )
}
