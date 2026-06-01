'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Settings, Sparkles, AlertCircle, Kanban, Send } from 'lucide-react'
import { toast } from 'sonner'
import { StagesLabelsSection } from '@/components/bot-config/stages-labels-section'
import { FollowupSection } from '@/components/bot-config/followup-section'

export default function StoreSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState('')
  const [autoReply, setAutoReply] = useState(true)
  const [ragEnabled, setRagEnabled] = useState(true)
  const [fallbackMessage, setFallbackMessage] = useState('')

  // Bot Config states (stages & followups)
  const [botConfig, setBotConfig] = useState<any>({
    stage_labels: [],
    lead_followup_enabled: false,
    lead_followup_steps: [],
    atendimento_followup_enabled: false,
    atendimento_followup_steps: [],
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  function handleBotConfigChange(updates: any) {
    setBotConfig((prev: any) => ({ ...prev, ...updates }))
  }

  async function fetchSettings() {
    try {
      setLoading(true)
      const searchParams = new URLSearchParams(window.location.search)
      const clientIdParam = searchParams.get('client_id')
      const url = clientIdParam ? `/api/store/settings?client_id=${clientIdParam}` : '/api/store/settings'

      const res = await fetch(url)
      if (!res.ok) throw new Error('Falha ao carregar configurações.')
      const data = await res.json()
      
      if (data.store) {
        setName(data.store.name || '')
      }
      if (data.settings) {
        setAgentName(data.settings.agent_name || '')
        setTone(data.settings.tone_of_voice || '')
        setAutoReply(data.settings.auto_reply_enabled !== false)
        setRagEnabled(data.settings.rag_enabled !== false)
        setFallbackMessage(data.settings.fallback_message || '')
      }
      if (data.botConfig) {
        setBotConfig({
          stage_labels: data.botConfig.stage_labels || [],
          lead_followup_enabled: data.botConfig.lead_followup_enabled || false,
          lead_followup_steps: data.botConfig.lead_followup_steps || [],
          atendimento_followup_enabled: data.botConfig.atendimento_followup_enabled || false,
          atendimento_followup_steps: data.botConfig.atendimento_followup_steps || [],
        })
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      const searchParams = new URLSearchParams(window.location.search)
      const clientIdParam = searchParams.get('client_id')

      const res = await fetch('/api/store/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientIdParam || undefined,
          name,
          agent_name: agentName,
          tone_of_voice: tone,
          auto_reply_enabled: autoReply,
          rag_enabled: ragEnabled,
          fallback_message: fallbackMessage,
          // Bot Config fields
          stage_labels: botConfig.stage_labels,
          lead_followup_enabled: botConfig.lead_followup_enabled,
          lead_followup_steps: botConfig.lead_followup_steps,
          atendimento_followup_enabled: botConfig.atendimento_followup_enabled,
          atendimento_followup_steps: botConfig.atendimento_followup_steps,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Falha ao salvar configurações.')
      }

      toast.success('Configurações salvas com sucesso!')
      fetchSettings()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando painel de configurações...</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-8 w-8 text-primary" />
          Configurações da Loja
        </h1>
        <p className="text-muted-foreground">
          Configure a identidade da sua loja, o comportamento do agente de IA e os limites de atendimento.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Dados Gerais</CardTitle>
              <CardDescription>Nome e informações básicas do estabelecimento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-name">Nome da Loja</Label>
                <Input
                  id="store-name"
                  placeholder="Ex: Rede Minas Leopoldina"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Agente Conversacional (IA)
              </CardTitle>
              <CardDescription>Defina a persona e as diretrizes do bot da sua loja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Nome do Assistente</Label>
                  <Input
                    id="agent-name"
                    placeholder="Ex: Vendedor Virtual"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-tone">Tom de Voz</Label>
                  <Input
                    id="agent-tone"
                    placeholder="Ex: consultivo, objetivo e cordial"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallback-message">Mensagem de Fallback (Erro)</Label>
                <Textarea
                  id="fallback-message"
                  placeholder="Mensagem enviada se a IA não entender ou houver erro..."
                  value={fallbackMessage}
                  onChange={(e) => setFallbackMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Kanban Stage Customization Card */}
          <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground/90">
                <Kanban className="h-5 w-5 text-primary" />
                Etapas do Funil (Kanban Board)
              </CardTitle>
              <CardDescription>
                Customize as colunas do seu Kanban e os respectivos gatilhos de follow-up automáticos por etapa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StagesLabelsSection
                config={botConfig}
                onChange={handleBotConfigChange}
              />
            </CardContent>
          </Card>

          {/* Follow-up steps customization Card */}
          <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground/90">
                <Send className="h-5 w-5 text-primary" />
                Mensagens de Follow-up (Cobrança)
              </CardTitle>
              <CardDescription>
                Configure as mensagens de lembrete enviadas se o cliente sumir ou não responder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FollowupSection
                config={botConfig}
                onChange={handleBotConfigChange}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Comportamento</CardTitle>
              <CardDescription>Ativação e integrações inteligentes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="font-semibold text-foreground">Responder Automaticamente</Label>
                  <p className="text-xs text-muted-foreground">Permite o bot responder no WhatsApp.</p>
                </div>
                <Switch checked={autoReply} onCheckedChange={setAutoReply} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="font-semibold text-foreground">Habilitar Busca RAG</Label>
                  <p className="text-xs text-muted-foreground">IA busca produtos no catálogo.</p>
                </div>
                <Switch checked={ragEnabled} onCheckedChange={setRagEnabled} />
              </div>

              <hr className="border-border/40" />

              <Button
                className="w-full font-bold shadow-lg shadow-primary/20"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Configurações'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
