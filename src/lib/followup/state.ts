/**
 * Follow-up State Management
 * Fase 1: Gerenciamento de estado consolidado de follow-up por conversa
 */

import { createClient } from '@/lib/supabase/server'

export type FollowupState =
  | 'none'
  | 'eligible'
  | 'scheduled'
  | 'active'
  | 'paused_by_human'
  | 'blocked'
  | 'recommended_manual'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type CadenceType = 'lead' | 'atendimento' | 'agendado' | 'human_retake'

export type ConversationFollowupState = {
  id: string
  client_id: string
  conversation_id: string
  contact_id?: string | null
  state: FollowupState
  cadence_type?: CadenceType | null
  current_step_key?: string | null
  current_step_label?: string | null
  total_attempts: number
  reason_code?: string | null
  reason_label?: string | null
  next_action?: string | null
  next_scheduled_for?: string | null
  last_evaluated_at?: string | null
  last_event_at?: string | null
  last_sent_at?: string | null
  last_error_at?: string | null
  last_error_message?: string | null
  requires_human_approval?: boolean
  ai_confidence?: number | null
  created_at: string
  updated_at: string
}

/**
 * Busca o estado atual de follow-up de uma conversa
 * 
 * @param conversationId - UUID da conversa
 * @returns Estado atual ou null se não existir
 */
export async function getConversationFollowupState(
  conversationId: string
): Promise<ConversationFollowupState | null> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('conversation_followup_state')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle()

    if (error) {
      console.error('[getConversationFollowupState] Error:', error)
      return null
    }

    return data
  } catch (err) {
    console.error('[getConversationFollowupState] Exception:', err)
    return null
  }
}

/**
 * Cria ou atualiza o estado de follow-up de uma conversa
 * 
 * @param data - Dados do estado (partial, mas client_id e conversation_id são obrigatórios)
 * @returns Estado atualizado
 */
export async function upsertConversationFollowupState(
  data: Partial<ConversationFollowupState> & {
    client_id: string
    conversation_id: string
    state: FollowupState
  }
): Promise<ConversationFollowupState | null> {
  try {
    const supabase = await createClient()
    
    const { data: result, error } = await supabase
      .from('conversation_followup_state')
      .upsert(
        {
          ...data,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'conversation_id'
        }
      )
      .select()
      .single()

    if (error) {
      console.error('[upsertConversationFollowupState] Error:', error)
      return null
    }

    return result
  } catch (err) {
    console.error('[upsertConversationFollowupState] Exception:', err)
    return null
  }
}

/**
 * Transição de estado com validação e registro
 * 
 * @param conversationId - UUID da conversa
 * @param clientId - UUID do cliente
 * @param newState - Novo estado
 * @param reason - Motivo da transição { code, label }
 * @returns Estado atualizado
 */
export async function transitionFollowupState(
  conversationId: string,
  clientId: string,
  newState: FollowupState,
  reason: {
    code: string
    label: string
  },
  metadata?: Partial<ConversationFollowupState>
): Promise<ConversationFollowupState | null> {
  try {
    const current = await getConversationFollowupState(conversationId)
    
    // Validar transição (opcional: adicionar state machine)
    // Por ora, permite qualquer transição
    
    return await upsertConversationFollowupState({
      client_id: clientId,
      conversation_id: conversationId,
      state: newState,
      reason_code: reason.code,
      reason_label: reason.label,
      last_evaluated_at: new Date().toISOString(),
      ...metadata
    })
  } catch (err) {
    console.error('[transitionFollowupState] Exception:', err)
    return null
  }
}

/**
 * Lista conversas por estado de follow-up
 * 
 * @param clientId - UUID do cliente
 * @param state - Estado para filtrar (opcional)
 * @param limit - Número máximo de resultados
 * @returns Lista de estados
 */
export async function listConversationFollowupStatesByClient(
  clientId: string,
  state?: FollowupState,
  limit = 100
): Promise<ConversationFollowupState[]> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('conversation_followup_state')
      .select('*')
      .eq('client_id', clientId)
      .order('last_evaluated_at', { ascending: false })
      .limit(limit)
    
    if (state) {
      query = query.eq('state', state)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('[listConversationFollowupStatesByClient] Error:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[listConversationFollowupStatesByClient] Exception:', err)
    return []
  }
}

/**
 * Lista conversas com follow-up programado (scheduled)
 * 
 * @param clientId - UUID do cliente
 * @returns Lista de estados scheduled ordenados por next_scheduled_for
 */
export async function listScheduledFollowups(
  clientId: string
): Promise<ConversationFollowupState[]> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('conversation_followup_state')
      .select('*')
      .eq('client_id', clientId)
      .eq('state', 'scheduled')
      .not('next_scheduled_for', 'is', null)
      .order('next_scheduled_for', { ascending: true })
      .limit(100)
    
    if (error) {
      console.error('[listScheduledFollowups] Error:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[listScheduledFollowups] Exception:', err)
    return []
  }
}

/**
 * Remove estado de follow-up (quando conversa é resolvida ou cancelada)
 * 
 * @param conversationId - UUID da conversa
 * @returns true se removeu com sucesso
 */
export async function deleteConversationFollowupState(
  conversationId: string
): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('conversation_followup_state')
      .delete()
      .eq('conversation_id', conversationId)
    
    if (error) {
      console.error('[deleteConversationFollowupState] Error:', error)
      return false
    }
    
    return true
  } catch (err) {
    console.error('[deleteConversationFollowupState] Exception:', err)
    return false
  }
}
