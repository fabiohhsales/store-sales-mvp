'use client'

import { useState } from 'react'
import { ExternalLink, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmbedUrls {
  kanban: { token: string; url: string; chatwoot_app_id: number | null }
  agenda: { token: string; url: string; chatwoot_app_id: number | null }
}

interface ChatwootAppsSetupProps {
  clientId: string
  hasChatwoot: boolean
}

export function ChatwootAppsSetup({ clientId, hasChatwoot }: ChatwootAppsSetupProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmbedUrls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'kanban' | 'agenda' | null>(null)

  async function handleSetup() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/setup-chatwoot-apps`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao configurar')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  function copyUrl(type: 'kanban' | 'agenda') {
    const url = type === 'kanban' ? result?.kanban.url : result?.agenda.url
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!hasChatwoot) {
    return (
      <div className="glass-card p-5 opacity-60">
        <h3 className="text-sm font-medium text-foreground mb-1">Embed Pipeline + Agenda</h3>
        <p className="text-xs text-muted-foreground">
          Disponível após o Chatwoot ser provisionado para este cliente.
        </p>
      </div>
    )
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Embed Pipeline + Agenda</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cria os tokens de embed e registra os Dashboard Apps no Chatwoot.
        </p>
      </div>

      {!result && (
        <Button size="sm" onClick={handleSetup} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Configurando...
            </>
          ) : (
            'Configurar Pipeline + Agenda'
          )}
        </Button>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {result && (
        <div className="space-y-3">
          <EmbedUrlRow
            label="Pipeline"
            url={result.kanban.url}
            copied={copied === 'kanban'}
            onCopy={() => copyUrl('kanban')}
          />
          <EmbedUrlRow
            label="Agenda"
            url={result.agenda.url}
            copied={copied === 'agenda'}
            onCopy={() => copyUrl('agenda')}
          />
          <Button size="sm" variant="outline" onClick={handleSetup} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Regenerar'}
          </Button>
        </div>
      )}
    </div>
  )
}

function EmbedUrlRow({
  label,
  url,
  copied,
  onCopy,
}: {
  label: string
  url: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
        <button
          onClick={onCopy}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Copiar URL ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Abrir ${label}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
