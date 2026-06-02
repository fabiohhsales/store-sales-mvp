'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Megaphone, Users, Trash2, Send, CheckCircle2, AlertTriangle, Play, Calendar, Eye, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Campaign {
  id: string
  name: string
  message_template: string
  segment_id: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed'
  scheduled_at: string | null
  sent_count: number
  delivered_count: number
  failed_count: number
  created_at: string
}

interface Segment {
  id: string
  name: string
  description: string | null
  rules: {
    tags?: string[]
    state?: string
    city?: string
    lifecycle_stage?: string
  }
}

export default function StoreCampaignsPage() {
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [segments, setSegments] = useState<Segment[]>([])

  // Campaign create modal state
  const [newCampaignOpen, setNewCampaignOpen] = useState(false)
  const [campName, setCampName] = useState('')
  const [campTemplate, setCampTemplate] = useState('')
  const [campSegmentId, setCampSegmentId] = useState<string>('all')
  const [campScheduledAt, setCampScheduledAt] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)

  // Segment manage modal state
  const [segmentModalOpen, setSegmentModalOpen] = useState(false)
  const [segName, setSegName] = useState('')
  const [segDescription, setSegDescription] = useState('')
  const [segStateRule, setSegStateRule] = useState('')
  const [segCityRule, setSegCityRule] = useState('')
  const [segTagsRule, setSegTagsRule] = useState('')
  const [segLifecycleRule, setSegLifecycleRule] = useState<string>('any')
  const [creatingSegment, setCreatingSegment] = useState(false)

  // Template preview helper
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/store/campaigns')
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
        setSegments(data.segments || [])
      } else {
        toast.error('Erro ao carregar dados de campanhas.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de conexão ao carregar campanhas.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCampaign = async () => {
    if (!campName.trim() || !campTemplate.trim()) {
      toast.error('Nome e template da mensagem são obrigatórios.')
      return
    }

    setCreatingCampaign(true)
    try {
      const res = await fetch('/api/store/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campName.trim(),
          message_template: campTemplate.trim(),
          segment_id: campSegmentId === 'all' ? null : campSegmentId,
          scheduled_at: campScheduledAt ? new Date(campScheduledAt).toISOString() : null,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Campanha "${data.name}" criada e agendada para envio!`)
        setNewCampaignOpen(false)
        setCampName('')
        setCampTemplate('')
        setCampSegmentId('all')
        setCampScheduledAt('')
        fetchData()
      } else {
        toast.error(data.error || 'Erro ao criar campanha.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao criar campanha.')
    } finally {
      setCreatingCampaign(false)
    }
  }

  const handleCreateSegment = async () => {
    if (!segName.trim()) {
      toast.error('Nome do segmento é obrigatório.')
      return
    }

    setCreatingSegment(true)
    try {
      const rules: any = {}
      if (segStateRule.trim()) rules.state = segStateRule.trim().toUpperCase()
      if (segCityRule.trim()) rules.city = segCityRule.trim()
      if (segTagsRule.trim()) {
        rules.tags = segTagsRule.split('|').map(t => t.trim()).filter(Boolean)
      }
      if (segLifecycleRule !== 'any') {
        rules.lifecycle_stage = segLifecycleRule
      }

      const res = await fetch('/api/store/campaigns/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: segName.trim(),
          description: segDescription.trim(),
          rules,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Segmento "${data.name}" criado com sucesso!`)
        setSegName('')
        setSegDescription('')
        setSegStateRule('')
        setSegCityRule('')
        setSegTagsRule('')
        setSegLifecycleRule('any')
        fetchData()
      } else {
        toast.error(data.error || 'Erro ao criar segmento.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao criar segmento.')
    } finally {
      setCreatingSegment(false)
    }
  }

  const handleDeleteSegment = async (id: string) => {
    try {
      const res = await fetch(`/api/store/campaigns/segments?id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Segmento excluído.')
        fetchData()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao excluir segmento.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao excluir segmento.')
    }
  }

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full border border-green-500/20"><CheckCircle2 size={11} /> Concluída</span>
      case 'sending':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full border border-blue-500/20 animate-pulse"><Send size={11} /> Enviando</span>
      case 'scheduled':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded-full border border-purple-500/20"><Calendar size={11} /> Agendada</span>
      case 'failed':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full border border-red-500/20"><AlertTriangle size={11} /> Falhou</span>
      default:
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-zinc-500/10 text-zinc-600 px-2 py-0.5 rounded-full border border-zinc-500/20"><HelpCircle size={11} /> Rascunho</span>
    }
  }

  const handleOpenPreview = (template: string) => {
    const preview = template
      .replace(/{nome}/gi, 'Maria')
      .replace(/{name}/gi, 'Maria')
      .replace(/{fullname}/gi, 'Maria Silva')
    setPreviewContent(preview)
    setPreviewOpen(true)
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando painel de campanhas...</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Megaphone className="h-8 w-8 text-primary" />
            Campanhas de Transmissão
          </h1>
          <p className="text-muted-foreground">
            Crie transmissões de WhatsApp para contatos segmentados com intervalo humano antipalm.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="font-semibold gap-1.5" onClick={() => setSegmentModalOpen(true)}>
            <Users className="h-4 w-4" />
            Segmentos
          </Button>
          <Button className="font-semibold shadow-lg shadow-primary/20 gap-1.5" onClick={() => setNewCampaignOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova Campanha
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
          <CardHeader>
            <CardTitle>Histórico de Envios</CardTitle>
            <CardDescription>Acompanhe o status e a performance das campanhas disparadas.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                <Megaphone size={48} className="text-muted-foreground/20" />
                <p className="font-medium text-muted-foreground">Nenhuma campanha criada ainda</p>
                <p className="text-xs text-muted-foreground/60">Crie uma nova campanha clicando no botão no topo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase font-bold bg-muted/20">
                      <th className="p-4">Campanha</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Envios (Sucesso/Falhas)</th>
                      <th className="p-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp) => {
                      const totalCount = (camp.sent_count || 0) + (camp.failed_count || 0)
                      return (
                        <tr key={camp.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold truncate max-w-xs">{camp.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{camp.message_template}</div>
                          </td>
                          <td className="p-4">{getStatusBadge(camp.status)}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-green-600">{camp.sent_count}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="font-semibold text-destructive">{camp.failed_count}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">Disparado em lote</div>
                          </td>
                          <td className="p-4 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenPreview(camp.message_template)}
                              title="Visualizar Mensagem"
                            >
                              <Eye size={15} />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Nova Campanha */}
      <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Campanha de Transmissão</DialogTitle>
            <DialogDescription>Construa a mensagem e determine qual grupo de clientes irá receber.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="camp-name">Nome da Campanha</Label>
              <Input
                id="camp-name"
                placeholder="Ex: Oferta Especial de Sofás"
                value={campName}
                onChange={(e) => setCampName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="camp-segment">Segmento de Clientes (Público)</Label>
              <Select value={campSegmentId} onValueChange={(val) => val && setCampSegmentId(val)}>
                <SelectTrigger id="camp-segment">
                  <SelectValue placeholder="Selecione o público alvo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Contatos (Sem filtro)</SelectItem>
                  {segments.map((seg) => (
                    <SelectItem key={seg.id} value={seg.id}>
                      {seg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="camp-template">Mensagem (Template)</Label>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Variáveis: <strong className="text-primary">{`{nome}`}</strong>
                </span>
              </div>
              <Textarea
                id="camp-template"
                placeholder="Ex: Olá {nome}, temos uma novidade incrível para você..."
                value={campTemplate}
                onChange={(e) => setCampTemplate(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="camp-schedule">Agendar Envio (Opcional)</Label>
              <Input
                id="camp-schedule"
                type="datetime-local"
                value={campScheduledAt}
                onChange={(e) => setCampScheduledAt(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Selecione uma data futura para agendar, ou deixe vazio para enviar de imediato.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCampaignOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateCampaign} disabled={creatingCampaign}>
              {creatingCampaign ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Criando...
                </>
              ) : (
                'Salvar e Enviar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerenciar Segmentos */}
      <Dialog open={segmentModalOpen} onOpenChange={setSegmentModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle>Gerenciar Segmentos de Contatos</DialogTitle>
            <DialogDescription>Crie públicos dinâmicos filtrando contatos por região, tags e estágio comercial.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Form Criar Segmento */}
            <div className="space-y-4 rounded-xl border border-border/50 p-4 bg-background/25">
              <h3 className="text-xs uppercase font-bold text-primary tracking-wider">Criar Novo Segmento</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="seg-name" className="text-xs">Nome do Segmento</Label>
                  <Input
                    id="seg-name"
                    placeholder="Ex: Clientes VIP - Minas Gerais"
                    value={segName}
                    onChange={(e) => setSegName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="seg-desc" className="text-xs">Descrição</Label>
                  <Input
                    id="seg-desc"
                    placeholder="Filtro para clientes em MG que compraram recentemente..."
                    value={segDescription}
                    onChange={(e) => setSegDescription(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="seg-state" className="text-xs">Estado (UF)</Label>
                  <Input
                    id="seg-state"
                    placeholder="Ex: MG"
                    maxLength={2}
                    value={segStateRule}
                    onChange={(e) => setSegStateRule(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="seg-city" className="text-xs">Cidade</Label>
                  <Input
                    id="seg-city"
                    placeholder="Ex: Belo Horizonte"
                    value={segCityRule}
                    onChange={(e) => setSegCityRule(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="seg-tags" className="text-xs">Tags (Separadas por |)</Label>
                  <Input
                    id="seg-tags"
                    placeholder="Ex: vip|importados"
                    value={segTagsRule}
                    onChange={(e) => setSegTagsRule(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="seg-lifecycle" className="text-xs">Estágio do Funil</Label>
                  <Select value={segLifecycleRule} onValueChange={(val) => val && setSegLifecycleRule(val)}>
                    <SelectTrigger id="seg-lifecycle" className="h-8 text-xs">
                      <SelectValue placeholder="Selecione estágio" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      <SelectItem value="any">Qualquer estágio</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="opportunity">Oportunidade</SelectItem>
                      <SelectItem value="customer">Cliente (Já comprou)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={handleCreateSegment} disabled={creatingSegment} className="font-semibold text-xs h-8">
                  {creatingSegment ? <Loader2 size={12} className="animate-spin mr-1" /> : <Plus size={12} className="mr-1" />}
                  Salvar Segmento
                </Button>
              </div>
            </div>

            {/* List de Segmentos Existentes */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Segmentos Ativos</h3>
              {segments.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">Nenhum segmento customizado criado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {segments.map((seg) => (
                    <div key={seg.id} className="flex items-center justify-between border border-border/30 rounded-lg p-3 bg-muted/10">
                      <div>
                        <h4 className="text-xs font-bold text-foreground">{seg.name}</h4>
                        {seg.description && <p className="text-[11px] text-muted-foreground">{seg.description}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {seg.rules.state && <span className="text-[9px] bg-secondary text-secondary-foreground font-semibold px-1 rounded">UF: {seg.rules.state}</span>}
                          {seg.rules.city && <span className="text-[9px] bg-secondary text-secondary-foreground font-semibold px-1 rounded">Cidade: {seg.rules.city}</span>}
                          {seg.rules.lifecycle_stage && <span className="text-[9px] bg-primary/10 text-primary font-semibold px-1 rounded">Funil: {seg.rules.lifecycle_stage}</span>}
                          {seg.rules.tags && seg.rules.tags.map(t => <span key={t} className="text-[9px] bg-secondary text-secondary-foreground font-semibold px-1 rounded">Tag: {t}</span>)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSegment(seg.id)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border">
            <Button className="w-full font-bold" onClick={() => setSegmentModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Preview da Mensagem */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Visualização da Mensagem</DialogTitle>
            <DialogDescription>Simulação de como o cliente receberá no WhatsApp.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/50 bg-chat-bubble/10 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner bg-secondary/20">
            {previewContent}
          </div>
          <DialogFooter>
            <Button className="w-full font-bold" onClick={() => setPreviewOpen(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
