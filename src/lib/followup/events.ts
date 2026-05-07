/**
 * Follow-up Events Management
 * Fase 1: Registro e consulta de eventos de follow-up para auditoria e timeline
 */

import { createClient } from '@/lib/supabase/server'
import type { CadenceType, FollowupState } from './state'

export type FollowupEventType =
  | 'followup_evaluated'
  | 'followup_scheduled'
  | 'followup_sent'
  | 'followup_skipped'
  | 'followup_blocked'
  | 'followup_paused'
  | 'followup_resumed'
  | 'followup_cancelled'
  | 'followup_completed'
  | 'followup_failed'
  | 'bot_retake_evaluated'
  | 'bot_retake_suggested'
  | 'bot_retake_scheduled'
  | 'bot_retake_executed'
  | 'tag_added'
  | 'tag_removed'
  | 'state_changed'

export type ActorType = 'system' | 'ai' | 'human' | 'cron' | 'api'

export type FollowupEvent = {
  id: string
  client_id: string
  conversation_id: string
  contact_id?: string | null
  event_type: FollowupEventType
  cadence_type?: CadenceType | null
  step_key?: string | null
  previous_state?: string | null
  new_state?: string | null
  reason_code?: string | null
  reason_label?: string | null
  display_text: string
  scheduled_for?: string | null
  sent_at?: string | null
  actor_type: ActorType
  actor_id?: string | null
  confidence?: number | null
  requires_human_approval?: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

/**
 * Registra um evento de follow-up
 * 
 * @param event - Dados do evento (sem id e created_at)
 * @returns Evento criado ou null se erro
 */
export async function recordFollowupEvent(
  event: Omit<FollowupEvent, 'id' | 'created_at'>
): Promise<FollowupEvent | null> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('followup_events')
      .insert(event)
      .select()
      .single()

    if (error) {
      console.error('[recordFollowupEvent] Error:', error)
      return null
    }

    return data
  } catch (err) {
    console.error('[recordFollowupEvent] Exception:', err)
    return null
  }
}

/**
 * Lista eventos de uma conversa (para timeline)
 * 
 * @param conversationId - UUID da conversa
 * @param limit - Número máximo de eventos
 * @returns Lista de eventos ordenados por created_at DESC
 */
export async function listConversationFollowupEvents(
  conversationId: string,
  limit = 50
): Promise<FollowupEvent[]> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('followup_events')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[listConversationFollowupEvents] Error:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[listConversationFollowupEvents] Exception:', err)
    return []
  }
}

/**
 * Lista eventos por cliente (para dashboard/analytics)
 * 
 * @param clientId - UUID do cliente
 * @param eventType - Tipo de evento para filtrar (opcional)
 * @param limit - Número máximo de eventos
 * @returns Lista de eventos
 */
export async function listClientFollowupEvents(
  clientId: string,
  eventType?: FollowupEventType,
  limit = 100
): Promise<FollowupEvent[]> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('followup_events')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (eventType) {
      query = query.eq('event_type', eventType)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('[listClientFollowupEvents] Error:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[listClientFollowupEvents] Exception:', err)
    return []
  }
}

/**
 * Gera display_text amigável a partir do evento
 * 
 * @param event - Dados do evento
 * @returns Texto formatado para exibir na timeline
 */
export function buildDisplayText(event: {
  event_type: FollowupEventType
  cadence_type?: CadenceType | null
  step_key?: string | null
  reason_label?: string | null
  scheduled_for?: string | null
  previous_state?: string | null
  new_state?: string | null
}): string {
  const { event_type, cadence_type, step_key, reason_label, scheduled_for, previous_state, new_state } = event
  
  switch (event_type) {
    case 'followup_scheduled':
      return `Follow-up programado para ${formatDateTime(scheduled_for)}${reason_label ? `. Motivo: ${reason_label}` : ''}`
    
    case 'followup_sent':
      return `Follow-up enviado (${formatCadenceStep(cadence_type, step_key)})`
    
    case 'followup_blocked':
      return `Follow-up bloqueado${reason_label ? `: ${reason_label}` : ''}`
    
    case 'followup_skipped':
      return `Follow-up pulado${reason_label ? `: ${reason_label}` : ''}`
    
    case 'followup_paused':
      return `Cadência pausada${reason_label ? `: ${reason_label}` : ''}`
    
    case 'followup_resumed':
      return `Cadência retomada${reason_label ? `: ${reason_label}` : ''}`
    
    case 'followup_cancelled':
      return `Cadência cancelada${reason_label ? `: ${reason_label}` : ''}`
    
    case 'followup_completed':
      return `Follow-up concluído${reason_label ? `: ${reason_label}` : ''}`
    
    case 'followup_failed':
      return `Falha no envio${reason_label ? `: ${reason_label}` : ''}`
    
    case 'bot_retake_suggested':
      return `Retomada sugerida${reason_label ? `: ${reason_label}` : ''}`
    
    case 'bot_retake_scheduled':
      return `Retomada programada para ${formatDateTime(scheduled_for)}`
    
    case 'bot_retake_executed':
      return `Bot retomou a conversa${reason_label ? `: ${reason_label}` : ''}`
    
    case 'state_changed':
      return `Estado mudou de ${previous_state || 'N/A'} para ${new_state || 'N/A'}`
    
    case 'followup_evaluated':
      return `Sistema avaliou follow-up${reason_label ? `: ${reason_label}` : ''}`
    
    default:
      return `Evento: ${event_type}`
  }
}

/**
 * Formata data/hora para exibição
 * 
 * @param iso - String ISO 8601
 * @returns Data formatada em pt-BR
 */
function formatDateTime(iso?: string | null): string {
  if (!iso) return 'data não definida'
  
  try {
    const date = new Date(iso)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return 'data inválida'
  }
}

/**
 * Formata cadence_type e step_key para exibição
 * 
 * @param cadence - Tipo de cadência
 * @param step - Chave do step
 * @returns Texto formatado
 */
function formatCadenceStep(cadence?: CadenceType | null, step?: string | null): string {
  const cadenceLabels: Record<CadenceType, string> = {
    lead: 'Lead',
    atendimento: 'Atendimento',
    agendado: 'Agendado',
    human_retake: 'Retomada'
  }
  
  const cadenceLabel = cadence ? cadenceLabels[cadence] : 'Desconhecido'
  const stepLabel = step || 'Step desconhecido'
  
  return `${cadenceLabel} - ${stepLabel}`
}

/**
 * Registra evento de envio de follow-up
 * Helper para simplificar registro após sendFollowupMessage()
 */
export async function recordFollowupSent(params: {
  clientId: string
  conversationId: string
  contactId?: string | null
  cadenceType: CadenceType
  stepKey: string
  message: string
  actorType?: ActorType
}): Promise<FollowupEvent | null> {
  const displayText = buildDisplayText({
    event_type: 'followup_sent',
    cadence_type: params.cadenceType,
    step_key: params.stepKey
  })
  
  return recordFollowupEvent({
    client_id: params.clientId,
    conversation_id: params.conversationId,
    contact_id: params.contactId,
    event_type: 'followup_sent',
    cadence_type: params.cadenceType,
    step_key: params.stepKey,
    display_text: displayText,
    sent_at: new Date().toISOString(),
    actor_type: params.actorType || 'system',
    metadata: {
      message: params.message.substring(0, 200) // Trunca para não poluir
    }
  })
}

/**
 * Registra evento de skip de follow-up
 * Helper para simplificar registro de skips
 */
export async function recordFollowupSkipped(params: {
  clientId: string
  conversationId: string
  contactId?: string | null
  cadenceType: CadenceType
  reasonCode: string
  reasonLabel: string
}): Promise<FollowupEvent | null> {
  const displayText = buildDisplayText({
    event_type: 'followup_skipped',
    reason_label: params.reasonLabel
  })
  
  return recordFollowupEvent({
    client_id: params.clientId,
    conversation_id: params.conversationId,
    contact_id: params.contactId,
    event_type: 'followup_skipped',
    cadence_type: params.cadenceType,
    reason_code: params.reasonCode,
    reason_label: params.reasonLabel,
    display_text: displayText,
    actor_type: 'system'
  })
}

/**
 * Registra evento de bloqueio de follow-up
 * Helper para simplificar registro de bloqueios
 */
export async function recordFollowupBlocked(params: {
  clientId: string
  conversationId: string
  contactId?: string | null
  reasonCode: string
  reasonLabel: string
}): Promise<FollowupEvent | null> {
  const displayText = buildDisplayText({
    event_type: 'followup_blocked',
    reason_label: params.reasonLabel
  })
  
  return recordFollowupEvent({
    client_id: params.clientId,
    conversation_id: params.conversationId,
    contact_id: params.contactId,
    event_type: 'followup_blocked',
    reason_code: params.reasonCode,
    reason_label: params.reasonLabel,
    display_text: displayText,
    actor_type: 'system'
  })
}
