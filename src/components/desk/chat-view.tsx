'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Send, Check, CheckCheck, Loader2, Trash2, UserCheck, Bot, StickyNote, MessageSquare, Paperclip, Zap, FileText, AlertTriangle, RefreshCw, Download, Play, Pause, Square, Mic, X, Images, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type ContactProfileData } from './contact-profile-panel'
import { ConversationHeaderState } from './conversation-header-state'
import { ConversationCaseSummaryBanner } from './conversation-case-summary-banner'
import { ConversationStateCard } from './conversation-state-card'
import { ConversationAppointmentCard } from './conversation-appointment-card'
import { ConversationIntakeCard } from './conversation-intake-card'
import { ConversationHistoryCard } from './conversation-history-card'
import { ConversationTimelineCard } from './conversation-timeline-card'
import type { ConversationContext } from '@/types/conversation-context'

interface Message {
  id: string
  content: string | null
  content_type: string
  sender_type: string
  from_who: string
  created_at: string
  evolution_message_id: string | null
  media_url: string | null
  media_mime_type?: string | null
  media_filename?: string | null
  media_size_bytes?: number | null
  media_duration_seconds?: number | null
  media_transcript?: string | null
  whatsapp_status?: string | null
}

interface ConversationDetail {
  id: string
  contact_id: string | null
  stage: 'bot_triage' | 'awaiting_human' | 'in_service' | 'resolved'
  status: string
  summary: string | null
  labels: string[]
  stage_changed_at: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
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
  currentUserId: string | null
  onConversationUpdate: () => void
}

type ActiveView = 'messages' | 'notes' | 'media'

function normalizeCustomData(customData: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!customData) return {}
  return Object.fromEntries(
    Object.entries(customData)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => [key, value == null || value === '_skipped' ? '' : String(value)])
  )
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

// --- Helper: resolve a URL de mídia via proxy ---
function mediaProxyUrl(message: Message, conversationId: string): string | null {
  if (message.evolution_message_id) return `/api/desk/media?msg_id=${message.evolution_message_id}&conversation_id=${conversationId}`
  if (message.media_url) return `/api/desk/media?db_msg_id=${message.id}&conversation_id=${conversationId}`
  return null
}

// --- Formata tamanho de arquivo ---
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// --- Formata duração em mm:ss ---
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// --- Sub-renderer: Audio Player WhatsApp-style ---
function AudioPlayer({ src, transcript }: { src: string; transcript?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [showTranscript, setShowTranscript] = useState(false)

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() } else { el.play() }
    setPlaying(!playing)
  }

  const toggleSpeed = () => {
    const el = audioRef.current
    if (!el) return
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1
    el.playbackRate = next
    setSpeed(next)
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[200px] max-w-[280px]">
      <div className="flex items-center gap-2">
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
          onTimeUpdate={(e) => {
            const el = e.target as HTMLAudioElement
            setProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0)
          }}
          onEnded={() => { setPlaying(false); setProgress(0) }}
        />
        <button onClick={togglePlay} className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors">
          {playing ? <Pause size={14} className="text-primary" /> : <Play size={14} className="text-primary ml-0.5" />}
        </button>
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-1 rounded-full bg-muted-foreground/20 overflow-hidden">
            <div className="h-full rounded-full bg-primary/60 transition-all duration-150" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{duration > 0 ? formatDuration((progress / 100) * duration) : '0:00'}</span>
            <span>{duration > 0 ? formatDuration(duration) : '--:--'}</span>
          </div>
        </div>
        <button onClick={toggleSpeed} className="flex-shrink-0 text-[10px] font-bold text-muted-foreground bg-muted-foreground/10 rounded px-1.5 py-0.5 hover:bg-muted-foreground/20 transition-colors">
          {speed}x
        </button>
      </div>
      {transcript && (
        <div className="space-y-0.5">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {showTranscript ? 'Ocultar transcrição' : 'Ver transcrição'}
          </button>
          {showTranscript && (
            <p className="text-[11px] text-muted-foreground italic leading-relaxed max-w-[260px]">
              &ldquo;{transcript}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, conversationId, onImageClick }: { message: Message; conversationId: string; onImageClick?: (url: string, alt: string) => void }) {
  const isOutgoing = message.sender_type !== 'contact'
  const isBot = message.sender_type === 'agent_bot'
  const isOperator = message.sender_type === 'operator'
  const isFollowup = message.from_who === 'followup'

  const mediaSrc = mediaProxyUrl(message, conversationId)
  const hasCaption = message.content && message.content !== '[Imagem]' && message.content !== '[Áudio]' && !message.content.startsWith('[Documento')

  // --- Render do conteúdo da bolha por tipo ---
  function renderContent() {
    if (message.content_type === 'image') {
      if (mediaSrc) {
        return (
          <div className="flex flex-col gap-1.5">
            <Image
              src={mediaSrc}
              alt={message.content || 'Imagem'}
              width={220}
              height={220}
              unoptimized
              className="max-w-[220px] h-auto rounded-lg cursor-pointer"
              onClick={() => onImageClick?.(mediaSrc, message.content || 'Imagem')}
            />
            {hasCaption && <span className="whitespace-pre-wrap text-sm">{message.content}</span>}
            <a href={mediaSrc} download className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit">
              <Download size={10} /> Baixar
            </a>
          </div>
        )
      }
      return <span className="italic text-muted-foreground">[Imagem indisponível]</span>
    }

    if (message.content_type === 'audio') {
      if (mediaSrc) {
        return <AudioPlayer src={mediaSrc} transcript={message.media_transcript} />
      }
      return <span className="italic text-muted-foreground">[Áudio indisponível]</span>
    }

    if (message.content_type === 'document') {
      const filename = message.media_filename || message.content || 'Documento'
      const displayName = filename.replace(/^\[Documento: /, '').replace(/\]$/, '')
      const isPdf = message.media_mime_type?.includes('pdf')

      if (mediaSrc) {
        return (
          <a
            href={mediaSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg bg-background/50 border border-border/50 px-3 py-2.5 min-w-[180px] hover:bg-background/80 transition-colors"
          >
            <div className={`flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${isPdf ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
              <FileText size={18} className={isPdf ? 'text-red-500' : 'text-blue-500'} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate max-w-[180px]">{displayName}</span>
              {message.media_size_bytes && (
                <span className="text-[10px] text-muted-foreground">{formatBytes(message.media_size_bytes)}</span>
              )}
            </div>
            <Download size={14} className="flex-shrink-0 text-muted-foreground ml-auto" />
          </a>
        )
      }
      return <span className="italic text-muted-foreground">[Arquivo indisponível]</span>
    }

    if (message.content_type === 'video') {
      if (mediaSrc) {
        return (
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={mediaSrc}
              controls
              preload="metadata"
              className="max-w-[280px] rounded-lg"
              style={{ maxHeight: 200 }}
            />
            {hasCaption && <span className="whitespace-pre-wrap text-sm">{message.content}</span>}
          </div>
        )
      }
      return <span className="italic text-muted-foreground">[Vídeo indisponível]</span>
    }

    // text ou tipo desconhecido
    return <span className="whitespace-pre-wrap">{message.content}</span>
  }

  return (
    <div className={`flex gap-2 ${isOutgoing ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full mt-1 ${
        isFollowup ? 'bg-amber-500/15' :
        isBot ? 'bg-primary/15' :
        isOperator ? 'bg-blue-500/15' :
        'bg-secondary'
      }`}>
        {isFollowup ? (
          <Clock size={12} className="text-amber-500" />
        ) : isBot ? (
          <Bot size={12} className="text-primary" />
        ) : isOperator ? (
          <UserCheck size={12} className="text-blue-500" />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">P</span>
        )}
      </div>

      <div className={`flex flex-col gap-1 max-w-[75%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isFollowup
            ? 'bg-amber-500/10 text-foreground rounded-tr-sm'
            : isBot
              ? 'bg-primary/10 text-foreground rounded-tr-sm'
              : isOperator
                ? 'bg-blue-500/10 text-foreground rounded-tr-sm'
                : 'bg-secondary text-foreground rounded-tl-sm'
        }`}>
          {renderContent()}
        </div>
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-muted-foreground">{relativeTime(message.created_at)}</span>
          {isFollowup && (
            <span className="text-[9px] font-medium text-amber-500/80 bg-amber-500/10 rounded px-1 py-0.5 leading-none">Follow-up</span>
          )}
          {isOutgoing && message.whatsapp_status && (
            message.whatsapp_status === 'read' || message.whatsapp_status === 'played' ? (
              <CheckCheck size={11} className="text-blue-400" />
            ) : message.whatsapp_status === 'delivered' ? (
              <CheckCheck size={11} className="text-muted-foreground" />
            ) : message.whatsapp_status === 'sent' ? (
              <Check size={11} className="text-muted-foreground" />
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatView({ conversationId, clientId, currentUserId, onConversationUpdate }: Props) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [profile, setProfile] = useState<ContactProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [intakeEditing, setIntakeEditing] = useState(false)
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

  // Lightbox de imagem
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxAlt, setLightboxAlt] = useState('')

  // Gravação de áudio
  const [recorderState, setRecorderState] = useState<'idle' | 'recording' | 'preview'>('idle')
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelRecordingRef = useRef(false)

  // Respostas rápidas (cliente)
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  // Respostas rápidas pessoais (operador logado)
  const [personalCannedResponses, setPersonalCannedResponses] = useState<CannedResponse[]>([])
  const [cannedPopoverOpen, setCannedPopoverOpen] = useState(false)
  const [cannedHighlight, setCannedHighlight] = useState(0)

  // Contexto consolidado (Fase 2)
  const [context, setContext] = useState<ConversationContext | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const notesBottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setConversation(data.conversation)
        setMessages(data.messages ?? [])
        setMessageError(null)
      } else {
        const body = await res.json().catch(() => ({}))
        const errMsg = body.error || `HTTP ${res.status}`
        console.error(`[ChatView] Erro ao carregar conversa ${conversationId}: ${errMsg}`)
        setMessageError(errMsg)
        if (showLoading) toast.error('Erro ao carregar mensagens')
      }
    } catch (err) {
      console.error(`[ChatView] Falha de rede ao carregar conversa ${conversationId}:`, err)
      setMessageError('Falha de conexão')
      if (showLoading) toast.error('Falha de conexão ao carregar mensagens')
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

  const loadContext = useCallback(async () => {
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/context`)
      if (res.ok) {
        const data = await res.json()
        setContext(data)
      }
    } catch {
      // silencioso — contexto não bloqueia o chat
    }
  }, [conversationId])

  useEffect(() => {
    void load(true)
    void loadProfile(true)
    void loadAssign()
    void loadNotes(true)
    void loadCannedResponses()
    void loadPersonalCannedResponses()
    void loadContext()
  }, [load, loadProfile, loadAssign, loadNotes, loadCannedResponses, loadPersonalCannedResponses, loadContext])

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
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        // Merge atualização (media_url, whatsapp_status, media_transcript etc.)
        setMessages((prev) => prev.map((m) =>
          m.id === (payload.new as Message).id ? { ...m, ...(payload.new as Message) } : m
        ))
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Falha ao enviar')
      }
      const saved = await res.json()
      setMessages((prev) => prev.map((m) => m.id === tempId ? saved : m))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar mensagem')
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

  async function fileToBase64(fileOrBlob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1] ?? '')
      }
      reader.onerror = () => reject(new Error('Falha ao ler mídia'))
      reader.readAsDataURL(fileOrBlob)
    })
  }

  async function sendMediaPayload(base64: string, mimetype: string, fileName?: string) {
    const res = await fetch(`/api/desk/conversations/${conversationId}/send-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mimetype, file_name: fileName }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro ao enviar mídia')
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
      const base64 = await fileToBase64(file)
      await sendMediaPayload(base64, file.type, file.name)
      toast.success('Mídia enviada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar mídia')
    } finally {
      setUploadLoading(false)
    }
  }

  async function startAudioRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Gravação de áudio não suportada neste navegador')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : ''

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorderChunksRef.current = []
      cancelRecordingRef.current = false
      setRecordingDuration(0)
      setRecorderState('recording')

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }

        stream.getTracks().forEach((track) => track.stop())

        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false
          setRecorderState('idle')
          setRecordingDuration(0)
          setAudioBlob(null)
          if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
          setAudioPreviewUrl(null)
          return
        }

        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const previewUrl = URL.createObjectURL(blob)

        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
        setAudioBlob(blob)
        setAudioPreviewUrl(previewUrl)
        setRecorderState('preview')
      }

      recorder.start()
    } catch (err) {
      console.error('[ChatView] Falha ao iniciar gravação:', err)
      toast.error('Não foi possível iniciar a gravação')
      setRecorderState('idle')
    }
  }

  function stopAudioRecording() {
    if (recorderState !== 'recording') return
    mediaRecorderRef.current?.stop()
  }

  function cancelAudioRecording() {
    if (recorderState === 'recording') {
      cancelRecordingRef.current = true
      mediaRecorderRef.current?.stop()
      return
    }

    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioPreviewUrl(null)
    setAudioBlob(null)
    setRecordingDuration(0)
    setRecorderState('idle')
  }

  async function sendRecordedAudio() {
    if (!audioBlob || uploadLoading) return

    setUploadLoading(true)
    try {
      const base64 = await fileToBase64(audioBlob)
      const extension = audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
      await sendMediaPayload(base64, audioBlob.type || 'audio/webm', `audio-${Date.now()}.${extension}`)

      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
      setAudioPreviewUrl(null)
      setAudioBlob(null)
      setRecordingDuration(0)
      setRecorderState('idle')
      toast.success('Áudio enviado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar áudio')
    } finally {
      setUploadLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
      try {
        mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop())
      } catch {
        // noop
      }
    }
  }, [audioPreviewUrl])

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
      {/* Header contextual — substitui a barra de ações antiga */}
      <ConversationHeaderState
        contactName={conversation.contacts?.name ?? null}
        contactPhone={conversation.contacts?.phone_number ?? null}
        conversationId={conversationId}
        stage={stage}
        stageChangedAt={conversation.stage_changed_at}
        assignedOperatorId={assignedOperatorId}
        currentUserId={currentUserId}
        operators={operators}
        assignLoading={assignLoading}
        actioning={actioning}
        checkingAvailability={checkingAvailability}
        labels={conversation.labels}
        onAction={handleAction}
        onAssign={handleAssign}
        onAvailabilitySearch={handleAvailabilitySearch}
        onOpenProfile={() => setProfileDialogOpen(true)}
      />

      {/* Toggle Mensagens / Notas / Mídia */}
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
        <button
          onClick={() => setActiveView('media')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'media'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Images size={12} />
          Mídia
          {messages.filter(m => m.content_type === 'image' || m.content_type === 'audio' || m.content_type === 'document' || m.content_type === 'video').length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {messages.filter(m => m.content_type === 'image' || m.content_type === 'audio' || m.content_type === 'document' || m.content_type === 'video').length}
            </span>
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeView === 'messages' ? (
            <>
              {/* Summary + intake banner */}
              <ConversationCaseSummaryBanner
                summary={conversation.summary}
                customData={normalizeCustomData(conversation.contacts?.custom_data)}
                appointmentStatus={profile?.appointments?.[0]?.status ?? null}
                lastIncomingAt={conversation.last_incoming_at}
                handoffReason={context?.handoff.reasonLabel ?? null}
                alerts={context?.summary.alerts ?? []}
                nextStep={context?.summary.nextStepSuggested ?? null}
              />

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messageError && !loading && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <AlertTriangle size={32} className="text-destructive/60 mb-2" />
                    <p className="text-sm text-destructive font-medium mb-1">Erro ao carregar mensagens</p>
                    <p className="text-xs text-muted-foreground mb-3">{messageError}</p>
                    <Button variant="outline" size="sm" onClick={() => load(true)} className="gap-1.5">
                      <RefreshCw size={14} />
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {!messageError && messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <MessageSquare size={32} className="text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} conversationId={conversationId} onImageClick={(url, alt) => { setLightboxUrl(url); setLightboxAlt(alt) }} />
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
                    {recorderState === 'recording' ? (
                      <>
                        <div className="flex-1 h-11 rounded-md border border-border bg-background/50 px-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            <span>Gravando áudio</span>
                            <span className="text-xs text-muted-foreground">{formatDuration(recordingDuration)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelAudioRecording} title="Cancelar">
                              <X size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={stopAudioRecording} title="Parar">
                              <Square size={14} />
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : recorderState === 'preview' ? (
                      <>
                        <div className="flex-1 h-11 rounded-md border border-border bg-background/50 px-2 flex items-center gap-2">
                          {audioPreviewUrl && (
                            <audio src={audioPreviewUrl} controls className="h-8 w-full" />
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={cancelAudioRecording}
                          disabled={uploadLoading}
                          className="h-11 w-11 flex-shrink-0"
                          title="Descartar áudio"
                        >
                          <X size={16} />
                        </Button>
                        <Button
                          size="icon"
                          onClick={sendRecordedAudio}
                          disabled={!audioBlob || uploadLoading}
                          className="h-11 w-11 flex-shrink-0"
                          title="Enviar áudio"
                        >
                          {uploadLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Textarea
                          ref={textareaRef}
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={handleKeyDown}
                          placeholder="Digite uma mensagem ou / para respostas rápidas…"
                          className="min-h-[44px] max-h-32 resize-none text-sm"
                          rows={1}
                          disabled={sending || uploadLoading}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadLoading || sending}
                          className="h-11 w-11 flex-shrink-0"
                          title="Enviar arquivo"
                        >
                          {uploadLoading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={startAudioRecording}
                          disabled={uploadLoading || sending}
                          className="h-11 w-11 flex-shrink-0"
                          title="Gravar áudio"
                        >
                          <Mic size={16} />
                        </Button>
                        <Button
                          size="icon"
                          onClick={handleSend}
                          disabled={!input.trim() || sending || uploadLoading}
                          className="h-11 w-11 flex-shrink-0"
                        >
                          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : activeView === 'media' ? (
            /* Galeria de mídia */
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {(() => {
                const mediaMsgs = messages.filter(m =>
                  m.content_type === 'image' || m.content_type === 'audio' ||
                  m.content_type === 'document' || m.content_type === 'video'
                )
                if (mediaMsgs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <Images size={24} className="text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">Nenhuma mídia nesta conversa.</p>
                    </div>
                  )
                }
                const images = mediaMsgs.filter(m => m.content_type === 'image')
                const others = mediaMsgs.filter(m => m.content_type !== 'image')
                return (
                  <>
                    {images.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Imagens ({images.length})</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {images.map((m) => {
                            const src = mediaProxyUrl(m, conversationId)
                            if (!src) return null
                            return (
                              <button
                                key={m.id}
                                onClick={() => { setLightboxUrl(src); setLightboxAlt(m.content || 'Imagem') }}
                                className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted/40 hover:opacity-80 transition-opacity"
                              >
                                <Image src={src} alt={m.content || 'Imagem'} fill unoptimized className="object-cover" />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {others.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Arquivos ({others.length})</p>
                        <div className="flex flex-col gap-2">
                          {others.map((m) => {
                            const src = mediaProxyUrl(m, conversationId)
                            const isAudio = m.content_type === 'audio'
                            const isVideo = m.content_type === 'video'
                            const isPdf = m.media_mime_type?.includes('pdf')
                            const displayName = (m.media_filename || m.content || 'Arquivo')
                              .replace(/^\[Documento: /, '').replace(/^\[Vídeo: /, '').replace(/\]$/, '')
                            const label = isAudio ? 'Áudio' : isVideo ? 'Vídeo' : isPdf ? 'PDF' : 'Documento'
                            const iconColor = isAudio ? 'text-purple-500' : isVideo ? 'text-green-500' : isPdf ? 'text-red-500' : 'text-blue-500'
                            const iconBg = isAudio ? 'bg-purple-500/10' : isVideo ? 'bg-green-500/10' : isPdf ? 'bg-red-500/10' : 'bg-blue-500/10'
                            return (
                              <div key={m.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                                <div className={`flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
                                  <FileText size={16} className={iconColor} />
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-xs font-medium truncate">{displayName}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {label}{m.media_size_bytes ? ` · ${formatBytes(m.media_size_bytes)}` : ''}{m.media_duration_seconds ? ` · ${formatDuration(m.media_duration_seconds)}` : ''} · {relativeTime(m.created_at)}
                                  </span>
                                  {isAudio && m.media_transcript && (
                                    <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">"{m.media_transcript}"</span>
                                  )}
                                </div>
                                {src && (
                                  <a href={src} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                    <Download size={14} />
                                  </a>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          ) : (
            /* View de Notas internas */
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

        {/* Sidebar — cards contextuais */}
        <aside className="hidden w-80 flex-shrink-0 border-l border-border bg-card/20 lg:block overflow-y-auto">
          <div className="p-4 space-y-4">
            <ConversationStateCard
              stage={stage}
              stageChangedAt={conversation.stage_changed_at}
              intakeCompletedAt={profile?.contact.intake_completed_at ?? null}
              customDataKeyCount={Object.keys(normalizeCustomData(profile?.contact.custom_data)).length}
              lastIncomingAt={conversation.last_incoming_at}
              lastOutgoingAt={conversation.last_outgoing_at}
              journeyStage={context?.header.journeyStage ?? null}
              handoffReason={context?.handoff.reasonLabel ?? null}
              handoffWaitMinutes={context?.handoff.waitDurationMinutes ?? null}
            />
            <ConversationAppointmentCard appointments={profile?.appointments ?? []} />
            {/* Contact basic data — nome editável + telefone + identifier */}
            <div className="rounded-xl border bg-background p-4 space-y-2">
              <Input
                value={contactNameDraft}
                onChange={(e) => setContactNameDraft(e.target.value)}
                placeholder="Nome do contato"
                className="text-sm font-medium h-8"
              />
              <p className="text-xs text-muted-foreground">{profile?.contact.phone_number}</p>
              {profile?.contact.identifier && profile.contact.identifier !== profile.contact.phone_number && (
                <p className="text-xs text-muted-foreground">{profile.contact.identifier}</p>
              )}
              {contactNameDraft !== (profile?.contact.name ?? '') && (
                <Button size="sm" variant="outline" onClick={handleSaveProfile} disabled={profileSaving} className="h-7 text-xs w-full">
                  {profileSaving ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                  Salvar nome
                </Button>
              )}
            </div>
            <ConversationIntakeCard
              customData={normalizeCustomData(profile?.contact.custom_data)}
              intakeCompletedAt={profile?.contact.intake_completed_at ?? null}
              editing={intakeEditing}
              saving={profileSaving}
              customDataDraft={customDataDraft}
              onToggleEdit={() => setIntakeEditing(!intakeEditing)}
              onCustomDataDraftChange={handleCustomDataDraftChange}
              onSave={handleSaveProfile}
              onClearIntake={handleClearIntake}
            />
            <ConversationHistoryCard
              conversations={profile?.conversations ?? []}
              currentConversationId={conversationId}
            />
            <ConversationTimelineCard events={context?.recentEvents ?? []} operators={operators.map(o => ({ id: o.id, name: o.display_name || o.email }))} />
          </div>
        </aside>
      </div>

      {/* Dialog de perfil — mobile (composição de cards) */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-lg p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-sm">Perfil do contato</DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <ConversationStateCard
              stage={stage}
              stageChangedAt={conversation.stage_changed_at}
              intakeCompletedAt={profile?.contact.intake_completed_at ?? null}
              customDataKeyCount={Object.keys(normalizeCustomData(profile?.contact.custom_data)).length}
              lastIncomingAt={conversation.last_incoming_at}
              lastOutgoingAt={conversation.last_outgoing_at}
              journeyStage={context?.header.journeyStage ?? null}
              handoffReason={context?.handoff.reasonLabel ?? null}
              handoffWaitMinutes={context?.handoff.waitDurationMinutes ?? null}
            />
            <ConversationAppointmentCard appointments={profile?.appointments ?? []} />
            <div className="rounded-xl border bg-background p-4 space-y-2">
              <Input
                value={contactNameDraft}
                onChange={(e) => setContactNameDraft(e.target.value)}
                placeholder="Nome do contato"
                className="text-sm font-medium h-8"
              />
              <p className="text-xs text-muted-foreground">{profile?.contact.phone_number}</p>
            </div>
            <ConversationIntakeCard
              customData={normalizeCustomData(profile?.contact.custom_data)}
              intakeCompletedAt={profile?.contact.intake_completed_at ?? null}
              editing={intakeEditing}
              saving={profileSaving}
              customDataDraft={customDataDraft}
              onToggleEdit={() => setIntakeEditing(!intakeEditing)}
              onCustomDataDraftChange={handleCustomDataDraftChange}
              onSave={handleSaveProfile}
              onClearIntake={handleClearIntake}
            />
            <ConversationHistoryCard
              conversations={profile?.conversations ?? []}
              currentConversationId={conversationId}
            />
            <ConversationTimelineCard events={context?.recentEvents ?? []} operators={operators.map(o => ({ id: o.id, name: o.display_name || o.email }))} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox de imagem */}
      <Dialog
        open={!!lightboxUrl}
        onOpenChange={(open) => {
          if (!open) {
            setLightboxUrl(null)
            setLightboxAlt('')
          }
        }}
      >
        <DialogContent className="max-w-4xl p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="text-sm">Visualização de imagem</DialogTitle>
            <DialogDescription className="sr-only">Preview ampliado da mídia enviada na conversa</DialogDescription>
          </DialogHeader>
          {lightboxUrl && (
            <div className="space-y-3">
              <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-background/40 p-2">
                <Image
                  src={lightboxUrl}
                  alt={lightboxAlt || 'Imagem'}
                  width={1400}
                  height={1000}
                  unoptimized
                  className="h-auto w-full rounded"
                />
              </div>
              <div className="flex justify-end">
                <a
                  href={lightboxUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors"
                >
                  <Download size={13} />
                  Baixar imagem
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
