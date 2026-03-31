'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Send, UserCheck, Bot, CheckCheck, Loader2, Info, Trash2, UserRound, StickyNote, MessageSquare, Paperclip, Zap, FileText, CalendarSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContactProfilePanel, type ContactProfileData } from './contact-profile-panel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'

interface Message {
  id: string
  content: string | null
  content_type: string
  sender_type: string
  from_who: string
  created_at: string
  evolution_message_id: string | null
  media_url: string | null
}

interface ConversationDetail {
  id: string
  contact_id: string | null
  stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved'
  status: string
  summary: string | null
  labels: string[]
  contacts: { id: string; name: string | null; phone_number: string | null; identifier: string | null; custom_data?: Record<string, string> | null } | null
}

interface OperatorOption {
  id: string
  email: string
  display_name: string | null
}

interface OperatorNote {
  id: string
  content: string
  operator_email: string
  operator_name: string | null
  created_at: string
}

interface CannedResponse {
  id: string
  shortcut: string
  content: string
  personal?: boolean
}

interface Props {
  conversationId: string
  clientId: string
  onConversationUpdate: () => void
}

type ActiveView = 'messages' | 'notes'

function normalizeCustomData(customData: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!customData) return {}
  return Object.fromEntries(
    Object.entries(customData)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => [key, value == null || value === '_skipped' ? '' : String(value)])
  )
}

const STAGE_LABELS = {
  bot_triage: 'Bot respondendo',
  awaiting_human: 'Bot pausado — aguardando você',
  in_service: 'Você está atendendo — bot pausado',
  resolved: 'Finalizado',
}

function relativeTime(date: string): string {
  try {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch { return '' }
}

function MessageBubble({ message, conversationId }: { message: Message; conversationId: string }) {
  const isOutgoing = message.sender_type !== 'contact'
  const isBot = message.sender_type === 'agent_bot'
  const isOperator = message.sender_type === 'operator'

  return (
    <div className={`flex gap-2 ${isOutgoing ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full mt-1 ${
        isBot ? 'bg-primary/15' :
        isOperator ? 'bg-blue-500/15' :
        'bg-secondary'
      }`}>
        {isBot ? (
          <Bot size={12} className="text-primary" />
        ) : isOperator ? (
          <UserCheck size={12} className="text-blue-500" />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">P</span>
        )}
      </div>

      <div className={`flex flex-col gap-1 max-w-[75%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isBot
            ? 'bg-primary/10 text-foreground rounded-tr-sm'
            : isOperator
              ? 'bg-blue-500/10 text-foreground rounded-tr-sm'
              : 'bg-secondary text-foreground rounded-tl-sm'
        }`}>
          {message.content_type === 'image' ? (
            message.evolution_message_id ? (
              <img
                src={`/api/desk/media?msg_id=${message.evolution_message_id}&conversation_id=${conversationId}`}
                alt={message.content || 'Imagem'}
                className="max-w-[220px] rounded-lg cursor-pointer"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : message.media_url ? (
              <img
                src={`/api/desk/media?db_msg_id=${message.id}&conversation_id=${conversationId}`}
                alt={message.content || 'Imagem'}
                className="max-w-[220px] rounded-lg cursor-pointer"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <span className="italic text-muted-foreground">[Imagem]</span>
            )
          ) : message.content_type === 'document' ? (
            message.evolution_message_id ? (
              <a
                href={`/api/desk/media?msg_id=${message.evolution_message_id}&conversation_id=${conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm underline underline-offset-2"
              >
                <FileText size={15} className="flex-shrink-0" />
                <span>{message.content || 'Documento'}</span>
              </a>
            ) : message.media_url ? (
              <a
                href={`/api/desk/media?db_msg_id=${message.id}&conversation_id=${conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm underline underline-offset-2"
              >
                <FileText size={15} className="flex-shrink-0" />
                <span>{message.content || 'Documento'}</span>
              </a>
            ) : (
              <span className="italic text-muted-foreground">{message.content || '[Documento]'}</span>
            )
          ) : message.content_type !== 'text' ? (
            <span className="italic text-muted-foreground">{message.content}</span>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground px-1">{relativeTime(message.created_at)}</span>
      </div>
    </div>
  )
}

export function ChatView({ conversationId, clientId, onConversationUpdate }: Props) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [profile, setProfile] = useState<ContactProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [input, setInput] = useState('')
  const [contactNameDraft, setContactNameDraft] = useState('')
  const [customDataDraft, setCustomDataDraft] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  // Atribuição de operador (B6)
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [assignedOperatorId, setAssignedOperatorId] = useState<string | null>(null)
  const [assignLoading, setAssignLoading] = useState(false)

  // Notas internas (B7)
  const [activeView, setActiveView] = useState<ActiveView>('messages')
  const [notes, setNotes] = useState<OperatorNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // Upload de mídia (B8)
  const [uploadLoading, setUploadLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Respostas rápidas (cliente)
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  // Respostas rápidas pessoais (operador logado)
  const [personalCannedResponses, setPersonalCannedResponses] = useState<CannedResponse[]>([])
  const [cannedPopoverOpen, setCannedPopoverOpen] = useState(false)
  const [cannedHighlight, setCannedHighlight] = useState(0)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const notesBottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const res = await fetch(`/api/desk/conversations/${conversationId}?client_id=${clientId}`)
    if (res.ok) {
      const data = await res.json()
      setConversation(data.conversation)
      setMessages(data.messages)
    }
    if (showLoading) setLoading(false)
  }, [conversationId, clientId])

  const loadProfile = useCallback(async (showLoading = false) => {
    if (showLoading) setProfileLoading(true)
    setProfileError(null)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/contact`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar perfil do contato')
      const profileData = data as ContactProfileData
      setProfile(profileData)
      setContactNameDraft(profileData.contact.name ?? '')
      setCustomDataDraft(normalizeCustomData(profileData.contact.custom_data))
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Erro ao carregar perfil do contato')
    } finally {
      if (showLoading) setProfileLoading(false)
    }
  }, [conversationId])

  const loadAssign = useCallback(async () => {
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/assign`)
      if (!res.ok) return
      const data = await res.json()
      setOperators(data.operators ?? [])
      setAssignedOperatorId(data.assigned_operator_id ?? null)
    } catch {
      // silencioso — atribuição não bloqueia o chat
    }
  }, [conversationId])

  const loadNotes = useCallback(async (showLoading = false) => {
    if (showLoading) setNotesLoading(true)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/notes`)
      if (res.ok) {
        const data = await res.json()
        setNotes(Array.isArray(data) ? data : [])
      }
    } finally {
      if (showLoading) setNotesLoading(false)
    }
  }, [conversationId])

  const loadCannedResponses = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/canned-responses`)
      if (res.ok) {
        const data = await res.json()
        setCannedResponses(Array.isArray(data) ? data : [])
      }
    } catch {
      // silencioso — respostas rápidas não bloqueiam o chat
    }
  }, [clientId])

  const loadPersonalCannedResponses = useCallback(async () => {
    try {
      const res = await fetch(`/api/desk/my-canned-responses?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setPersonalCannedResponses(Array.isArray(data) ? data : [])
      }
    } catch {
      // silencioso
    }
  }, [clientId])

  useEffect(() => {
    void load(true)
    void loadProfile(true)
    void loadAssign()
    void loadNotes(true)
    void loadCannedResponses()
    void loadPersonalCannedResponses()
  }, [load, loadProfile, loadAssign, loadNotes, loadCannedResponses, loadPersonalCannedResponses])

  // Polling de fallback
  useEffect(() => {
    const interval = setInterval(() => load(false), 4000)
    return () => clearInterval(interval)
  }, [load])

  // Scroll para o final — mensagens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Scroll para o final — notas
  useEffect(() => {
    if (activeView === 'notes') {
      notesBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [notes, activeView])

  // Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === (payload.new as Message).id)
          if (exists) return prev
          return [...prev, payload.new as Message]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      }, (payload) => {
        setConversation((prev) => prev ? { ...prev, ...(payload.new as ConversationDetail) } : prev)
        onConversationUpdate()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, onConversationUpdate])

  async function handleAvailabilitySearch() {
    setCheckingAvailability(true)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_window_hint: 'próximos 7 dias' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`Erro: ${body.error ?? 'falha ao buscar disponibilidades'}`)
        return
      }
      toast.success('Disponibilidades enviadas para o paciente')
      await load(false)
    } catch {
      toast.error('Falha de conexão ao buscar disponibilidades')
    } finally {
      setCheckingAvailability(false)
    }
  }

  async function handleAction(action: 'assume' | 'return' | 'resolve') {
    setActioning(true)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json()
      if (!res.ok) { toast.error(`Erro: ${body.error ?? 'falha ao executar ação'}`); return }
      setConversation((prev) => prev ? { ...prev, stage: body.stage } : prev)
      const labels = { assume: 'Conversa assumida — você pode digitar', return: 'Bot retomou a conversa', resolve: 'Conversa finalizada' }
      toast.success(labels[action])
      onConversationUpdate()
    } catch {
      toast.error('Erro de conexão ao executar ação')
    } finally {
      setActioning(false)
    }
  }

  async function handleAssign(operatorId: string | null) {
    setAssignLoading(true)
    const prev = assignedOperatorId
    setAssignedOperatorId(operatorId) // otimista
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: operatorId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erro ao atribuir operador')
      }
      const op = operators.find((o) => o.id === operatorId)
      toast.success(operatorId ? `Atribuído para ${op?.display_name ?? op?.email}` : 'Atribuição removida')
    } catch (err) {
      setAssignedOperatorId(prev) // reverte
      toast.error(err instanceof Error ? err.message : 'Erro ao atribuir operador')
    } finally {
      setAssignLoading(false)
    }
  }

  async function handleClearIntake() {
    try {
      await fetch(`/api/desk/conversations/${conversationId}/clear-intake`, { method: 'DELETE' })
      await Promise.all([load(false), loadProfile(false)])
      toast.success('Intake limpo')
    } catch {
      toast.error('Erro ao limpar intake')
    }
  }

  async function handleSaveProfile() {
    setProfileSaving(true)
    try {
      const body: Record<string, unknown> = { name: contactNameDraft }
      if (Object.keys(customDataDraft).length > 0) body.custom_data = customDataDraft
      const res = await fetch(`/api/desk/conversations/${conversationId}/contact`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar perfil')
      await Promise.all([load(false), loadProfile(false)])
      toast.success('Perfil do contato atualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    } finally {
      setProfileSaving(false)
    }
  }

  function handleCustomDataDraftChange(key: string, value: string) {
    setCustomDataDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')
    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [...prev, {
      id: tempId, content, content_type: 'text',
      sender_type: 'operator', from_who: 'human',
      created_at: new Date().toISOString(), evolution_message_id: null, media_url: null,
    }])
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Falha ao enviar')
      const saved = await res.json()
      setMessages((prev) => prev.map((m) => m.id === tempId ? saved : m))
    } catch {
      toast.error('Falha ao enviar mensagem')
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInput(content)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  async function handleSaveNote() {
    const content = noteInput.trim()
    if (!content || noteSaving) return
    setNoteSaving(true)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar nota')
      setNotes((prev) => [...prev, data as OperatorNote])
      setNoteInput('')
      toast.success('Nota salva')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar nota')
    } finally {
      setNoteSaving(false)
    }
  }

  // Lista mesclada: pessoais primeiro (priority), depois de cliente — memoizada
  const allCannedMerged = useMemo<CannedResponse[]>(() => [
    ...personalCannedResponses.map((r) => ({ ...r, personal: true })),
    ...cannedResponses.map((r) => ({ ...r, personal: false })),
  ], [personalCannedResponses, cannedResponses])

  // Filtra pelo query após "/" — memoizado
  const cannedQuery = input.startsWith('/') ? input.slice(1).toLowerCase() : null
  const filteredCanned = useMemo(
    () => cannedQuery !== null
      ? allCannedMerged.filter((r) => r.shortcut.includes(cannedQuery) || r.content.toLowerCase().includes(cannedQuery))
      : [],
    [allCannedMerged, cannedQuery]
  )

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    const query = val.startsWith('/') ? val.slice(1).toLowerCase() : null
    if (query !== null) {
      const matches = allCannedMerged.filter((r) => r.shortcut.includes(query) || r.content.toLowerCase().includes(query))
      setCannedPopoverOpen(matches.length > 0)
      setCannedHighlight(0)
    } else {
      setCannedPopoverOpen(false)
    }
  }

  function applyCanned(response: CannedResponse) {
    setInput(response.content)
    setCannedPopoverOpen(false)
    setCannedHighlight(0)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (cannedPopoverOpen && filteredCanned.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCannedHighlight((h) => (h + 1) % filteredCanned.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCannedHighlight((h) => (h - 1 + filteredCanned.length) % filteredCanned.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyCanned(filteredCanned[cannedHighlight])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCannedPopoverOpen(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveNote() }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input para permitir re-upload do mesmo arquivo
    e.target.value = ''

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo excede o limite de 10 MB')
      return
    }

    setUploadLoading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove o prefixo "data:<mimetype>;base64,"
          resolve(result.split(',')[1] ?? '')
        }
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
        reader.readAsDataURL(file)
      })

      const res = await fetch(`/api/desk/conversations/${conversationId}/send-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimetype: file.type, file_name: file.name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao enviar mídia')
      toast.success('Mídia enviada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar mídia')
    } finally {
      setUploadLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col p-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
            <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
            <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-48' : 'w-64'}`} />
          </div>
        ))}
      </div>
    )
  }

  if (!conversation) return null

  const stage = conversation.stage
  const canAssume = stage === 'awaiting_human' || stage === 'bot_triage'
  const canReturn = stage === 'in_service'
  const canSend = stage === 'in_service'
  const isResolved = stage === 'resolved'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-card/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={
              stage === 'awaiting_human' ? 'destructive' :
              stage === 'in_service' ? 'default' : 'secondary'
            }
            className="text-xs"
          >
            {STAGE_LABELS[stage]}
          </Badge>

          {/* Atribuição de operador — B6 */}
          {operators.length > 0 && (
            <Select
              value={assignedOperatorId ?? 'none'}
              onValueChange={(val) => handleAssign(val === 'none' ? null : val)}
              disabled={assignLoading}
            >
              <SelectTrigger className="h-7 w-44 text-xs border-dashed">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs text-muted-foreground">
                  Sem responsável
                </SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id} className="text-xs">
                    {op.display_name ?? op.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {conversation.labels.length > 0 && (
            <span className="text-xs text-muted-foreground">{conversation.labels.join(', ')}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs lg:hidden"
            onClick={() => setProfileDialogOpen(true)}
          >
            <UserRound size={12} className="mr-1" />
            Contato
          </Button>

          {canAssume && (
            <Button size="sm" onClick={() => handleAction('assume')} disabled={actioning} className="h-8 text-xs">
              {actioning ? <Loader2 size={12} className="mr-1 animate-spin" /> : <UserCheck size={12} className="mr-1" />}
              Assumir conversa
            </Button>
          )}

          {canReturn && (
            <Button size="sm" variant="outline" onClick={() => handleAction('return')} disabled={actioning}
              className="h-8 text-xs border-orange-500/40 text-orange-500 hover:bg-orange-500/10">
              {actioning ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Bot size={12} className="mr-1" />}
              Devolver ao bot
            </Button>
          )}

          {canSend && (
            <Button size="sm" variant="outline" onClick={handleAvailabilitySearch} disabled={checkingAvailability}
              className="h-8 text-xs">
              {checkingAvailability ? <Loader2 size={12} className="mr-1 animate-spin" /> : <CalendarSearch size={12} className="mr-1" />}
              Disponibilidades
            </Button>
          )}

          {!isResolved && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={actioning} className="h-8 text-xs">
                  <CheckCheck size={12} className="mr-1" />
                  Finalizar
                </Button>
              </DialogTrigger>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>Finalizar conversa?</DialogTitle>
                  <DialogDescription>
                    A conversa será marcada como resolvida e o bot não responderá mais.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                  <DialogClose asChild><Button onClick={() => handleAction('resolve')}>Finalizar</Button></DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Toggle Mensagens / Notas — B7 */}
      <div className="flex border-b border-border bg-card/20 flex-shrink-0">
        <button
          onClick={() => setActiveView('messages')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'messages'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare size={12} />
          Mensagens
        </button>
        <button
          onClick={() => setActiveView('notes')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'notes'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <StickyNote size={12} />
          Notas internas
          {notes.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {notes.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeView === 'messages' ? (
            <>
              {/* Resumo de triagem */}
              {conversation.summary && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-primary/5 border-b border-border text-xs text-muted-foreground">
                  <Info size={13} className="text-primary mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{conversation.summary}</span>
                </div>
              )}

              {/* Intake */}
              {conversation.contacts?.custom_data && Object.keys(conversation.contacts.custom_data).filter(k => !k.startsWith('_')).length > 0 && (
                <div className="flex flex-col gap-1 px-4 py-2.5 bg-secondary/30 border-b border-border text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground/70">Dados do paciente</span>
                    <button
                      onClick={handleClearIntake}
                      className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Limpar intake (para testes)"
                    >
                      <Trash2 size={11} />
                      <span>Limpar</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                    {Object.entries(conversation.contacts.custom_data)
                      .filter(([k]) => !k.startsWith('_'))
                      .map(([key, value]) => (
                        <div key={key} className="flex flex-col">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="text-foreground font-medium truncate">{String(value) === '_skipped' ? '—' : String(value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} conversationId={conversationId} />
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input de mensagem */}
              <div className="border-t border-border p-3 bg-card/50 flex-shrink-0">
                {isResolved ? (
                  <div className="flex items-center justify-center py-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CheckCheck size={13} className="text-green-500" />
                      Conversa finalizada
                    </p>
                  </div>
                ) : !canSend ? (
                  <div className="flex items-center justify-center py-2 gap-2">
                    <UserCheck size={13} className="text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      Clique em <strong>Assumir conversa</strong> para pausar o bot e responder como o número
                    </p>
                  </div>
                ) : (
                  <div className="relative flex items-end gap-2">
                    {/* Popover de respostas rápidas */}
                    {cannedPopoverOpen && filteredCanned.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 w-full max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-50">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/40">
                          <Zap size={11} className="text-primary" />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Respostas rápidas</span>
                        </div>
                        {filteredCanned.map((r, idx) => (
                          <button
                            key={`${r.personal ? 'p' : 'c'}-${r.id}`}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); applyCanned(r) }}
                            className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                              idx === cannedHighlight ? 'bg-primary/10' : 'hover:bg-secondary/60'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-primary">/{r.shortcut}</span>
                              {r.personal && (
                                <span className="text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-primary/15 text-primary leading-none">
                                  Meu
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground line-clamp-2">{r.content}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept="image/*,application/pdf,video/mp4,audio/*"
                      onChange={handleFileChange}
                    />
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Digite uma mensagem ou / para respostas rápidas…"
                      className="min-h-[44px] max-h-32 resize-none text-sm"
                      rows={1}
                      disabled={sending}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLoading}
                      className="h-11 w-11 flex-shrink-0"
                      title="Enviar arquivo"
                    >
                      {uploadLoading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                    </Button>
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!input.trim() || sending}
                      className="h-11 w-11 flex-shrink-0"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* View de Notas internas — B7 */
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" />
                    Carregando notas...
                  </div>
                ) : notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <StickyNote size={24} className="text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma nota interna ainda.</p>
                    <p className="text-xs text-muted-foreground/60">Notas são visíveis apenas para a equipe.</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {note.operator_name ?? note.operator_email}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(note.created_at)}</span>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {note.content}
                      </p>
                    </div>
                  ))
                )}
                <div ref={notesBottomRef} />
              </div>

              {/* Input de nota */}
              <div className="border-t border-border p-3 bg-card/50 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={handleNoteKeyDown}
                    placeholder="Escreva uma nota interna... (Enter para salvar)"
                    className="min-h-[44px] max-h-32 resize-none text-sm"
                    rows={1}
                    disabled={noteSaving}
                  />
                  <Button
                    size="icon"
                    onClick={handleSaveNote}
                    disabled={!noteInput.trim() || noteSaving}
                    variant="outline"
                    className="h-11 w-11 flex-shrink-0"
                  >
                    {noteSaving ? <Loader2 size={16} className="animate-spin" /> : <StickyNote size={16} />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sidebar — perfil do contato */}
        <aside className="hidden w-80 flex-shrink-0 border-l border-border bg-card/20 lg:block">
          <ContactProfilePanel
            conversationId={conversationId}
            loading={profileLoading}
            saving={profileSaving}
            error={profileError}
            profile={profile}
            nameDraft={contactNameDraft}
            customDataDraft={customDataDraft}
            onNameDraftChange={setContactNameDraft}
            onCustomDataDraftChange={handleCustomDataDraftChange}
            onSave={handleSaveProfile}
          />
        </aside>
      </div>

      {/* Dialog de perfil — mobile */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-lg p-0 sm:max-w-lg">
          <ContactProfilePanel
            conversationId={conversationId}
            loading={profileLoading}
            saving={profileSaving}
            error={profileError}
            profile={profile}
            nameDraft={contactNameDraft}
            customDataDraft={customDataDraft}
            onNameDraftChange={setContactNameDraft}
            onCustomDataDraftChange={handleCustomDataDraftChange}
            onSave={handleSaveProfile}
            className="max-h-[75vh]"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
