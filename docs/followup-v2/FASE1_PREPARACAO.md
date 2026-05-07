# Preparação para Fase 1 — Estado e Eventos

**Data:** 2026-05-07  
**Status:** PR #39 aprovado, baseline preenchido, pronto para iniciar Fase 1  
**Branch atual:** `feat/followup-v2`  

---

## ✅ Fase 0 — Completa

- [x] 11 documentos criados (9.390 linhas)
- [x] Baseline preenchido com dados reais do Supabase
- [x] Review técnico completo (Nota 4.9/5.0)
- [x] PR #39 criado e aprovado
- [x] Commits pushados para GitHub

---

## 🎯 Fase 1 — Estado e Eventos

**Objetivo:** Criar rastreabilidade completa de todas as decisões de follow-up antes de mudar qualquer automação.

**Duração estimada:** 1 semana (5 dev-days)  
**Entregas principais:**
1. Migration `018_conversation_followup_state.sql`
2. Migration `019_followup_events.sql`
3. Helper `src/lib/followup/state.ts`
4. Helper `src/lib/followup/events.ts`
5. Instrumentação de pipelines atuais
6. Testes unitários

---

## 📋 Checklist de Início da Fase 1

### Pré-requisitos

- [x] PR #39 aprovado
- [x] Baseline coletado
- [x] Review técnico concluído
- [ ] Merge PR #39 → `feat/followup-v2` (ou manter feat/followup-v2 direto)
- [ ] Criar branch `feat/followup-v2-phase-1` de `feat/followup-v2`

### Entregas da Fase 1

#### 1. Migration: `conversation_followup_state`

**Arquivo:** `supabase/migrations/018_conversation_followup_state.sql`

**DDL:**
```sql
CREATE TABLE IF NOT EXISTS conversation_followup_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid,

  state text NOT NULL CHECK (
    state IN (
      'none',
      'eligible',
      'scheduled',
      'active',
      'paused_by_human',
      'blocked',
      'recommended_manual',
      'completed',
      'cancelled',
      'failed'
    )
  ),

  cadence_type text CHECK (
    cadence_type IN ('lead', 'atendimento', 'agendado', 'human_retake')
  ),

  current_step_key text,
  current_step_label text,
  total_attempts int DEFAULT 0,

  reason_code text,
  reason_label text,

  next_action text,
  next_scheduled_for timestamptz,

  last_evaluated_at timestamptz,
  last_event_at timestamptz,
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,

  requires_human_approval boolean DEFAULT false,
  ai_confidence numeric,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_client_state
  ON conversation_followup_state(client_id, state);

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_next_scheduled
  ON conversation_followup_state(client_id, next_scheduled_for)
  WHERE next_scheduled_for IS NOT NULL;

-- RLS Policies
ALTER TABLE conversation_followup_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read own client's follow-up state"
ON conversation_followup_state FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT client_id FROM panel_users WHERE id = auth.uid()
    UNION
    SELECT id FROM panel_clients WHERE id IN (
      SELECT client_id FROM panel_users WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

CREATE POLICY "Only system can write follow-up state"
ON conversation_followup_state FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Comentários
COMMENT ON TABLE conversation_followup_state IS 
'Estado consolidado de follow-up por conversa. Atualizado pelo orchestrator após cada decisão.';

COMMENT ON COLUMN conversation_followup_state.state IS 
'Estado atual: none, eligible, scheduled, active, paused_by_human, blocked, recommended_manual, completed, cancelled, failed';

COMMENT ON COLUMN conversation_followup_state.next_scheduled_for IS 
'Timestamp do próximo envio programado (timestamptz para respeitar timezone)';
```

**Critérios de aceite:**
- [ ] Migration roda sem erros
- [ ] Constraint CHECK funciona (rejeita estados inválidos)
- [ ] Unique constraint em `conversation_id` funciona
- [ ] RLS permite leitura por operators do mesmo client
- [ ] RLS bloqueia escrita por operators (apenas service_role)

---

#### 2. Migration: `followup_events`

**Arquivo:** `supabase/migrations/019_followup_events.sql`

**DDL:**
```sql
CREATE TABLE IF NOT EXISTS followup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid,

  event_type text NOT NULL,
  cadence_type text,
  step_key text,

  previous_state text,
  new_state text,

  reason_code text,
  reason_label text,
  display_text text NOT NULL,

  scheduled_for timestamptz,
  sent_at timestamptz,

  actor_type text NOT NULL DEFAULT 'system',
  actor_id uuid,

  confidence numeric,
  requires_human_approval boolean DEFAULT false,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_events_conversation
  ON followup_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followup_events_client_created
  ON followup_events(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followup_events_type
  ON followup_events(client_id, event_type, created_at DESC);

-- Particionamento por mês (para performance futura)
-- Nota: Implementar após volume crescer

-- RLS Policies
ALTER TABLE followup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read own client's follow-up events"
ON followup_events FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT client_id FROM panel_users WHERE id = auth.uid()
    UNION
    SELECT id FROM panel_clients WHERE id IN (
      SELECT client_id FROM panel_users WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

CREATE POLICY "Only system can write follow-up events"
ON followup_events FOR INSERT
TO service_role
WITH CHECK (true);

-- Comentários
COMMENT ON TABLE followup_events IS 
'Histórico auditável de todas as decisões de follow-up. Eventos aparecem na timeline da conversa.';

COMMENT ON COLUMN followup_events.display_text IS 
'Texto amigável para exibir na timeline (ex: "Follow-up programado para amanhã às 09:00")';

COMMENT ON COLUMN followup_events.actor_type IS 
'Quem disparou: system (cron), ai (agent), human (operator), api (external)';
```

**Critérios de aceite:**
- [ ] Migration roda sem erros
- [ ] Índices criados corretamente
- [ ] RLS permite leitura por operators do mesmo client
- [ ] RLS bloqueia INSERT por operators (apenas service_role)
- [ ] Performance de SELECT com índice `conversation_id + created_at DESC`

---

#### 3. Helper: `state.ts`

**Arquivo:** `src/lib/followup/state.ts`

**Funções principais:**

```typescript
import { supabase } from '@/lib/supabase/client'

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

export type ConversationFollowupState = {
  id: string
  client_id: string
  conversation_id: string
  contact_id?: string | null
  state: FollowupState
  cadence_type?: 'lead' | 'atendimento' | 'agendado' | 'human_retake' | null
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
 */
export async function getConversationFollowupState(
  conversationId: string
): Promise<ConversationFollowupState | null> {
  const { data, error } = await supabase
    .from('conversation_followup_state')
    .select('*')
    .eq('conversation_id', conversationId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw error
  }

  return data
}

/**
 * Cria ou atualiza o estado de follow-up de uma conversa
 */
export async function upsertConversationFollowupState(
  data: Partial<ConversationFollowupState> & {
    client_id: string
    conversation_id: string
  }
): Promise<ConversationFollowupState> {
  const { data: result, error } = await supabase
    .from('conversation_followup_state')
    .upsert({
      ...data,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'conversation_id'
    })
    .select()
    .single()

  if (error) throw error
  return result
}

/**
 * Transição de estado com validação
 */
export async function transitionFollowupState(
  conversationId: string,
  newState: FollowupState,
  reason: {
    code: string
    label: string
  }
): Promise<ConversationFollowupState> {
  const current = await getConversationFollowupState(conversationId)
  
  // Validar transição (opcional: adicionar state machine)
  // Por ora, permite qualquer transição
  
  return upsertConversationFollowupState({
    client_id: current?.client_id || '', // TODO: resolver client_id
    conversation_id: conversationId,
    state: newState,
    reason_code: reason.code,
    reason_label: reason.label,
    last_evaluated_at: new Date().toISOString()
  })
}
```

**Critérios de aceite:**
- [ ] Funções compilam sem erros TypeScript
- [ ] `getConversationFollowupState()` retorna null se não existe
- [ ] `upsertConversationFollowupState()` cria novo ou atualiza existente
- [ ] `transitionFollowupState()` atualiza estado corretamente
- [ ] Testes unitários passam

---

#### 4. Helper: `events.ts`

**Arquivo:** `src/lib/followup/events.ts`

**Funções principais:**

```typescript
import { supabase } from '@/lib/supabase/client'

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

export type FollowupEvent = {
  id: string
  client_id: string
  conversation_id: string
  contact_id?: string | null
  event_type: FollowupEventType
  cadence_type?: 'lead' | 'atendimento' | 'agendado' | 'human_retake' | null
  step_key?: string | null
  previous_state?: string | null
  new_state?: string | null
  reason_code?: string | null
  reason_label?: string | null
  display_text: string
  scheduled_for?: string | null
  sent_at?: string | null
  actor_type: 'system' | 'ai' | 'human' | 'cron' | 'api'
  actor_id?: string | null
  confidence?: number | null
  requires_human_approval?: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

/**
 * Registra um evento de follow-up
 */
export async function recordFollowupEvent(
  event: Omit<FollowupEvent, 'id' | 'created_at'>
): Promise<FollowupEvent> {
  const { data, error } = await supabase
    .from('followup_events')
    .insert(event)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Lista eventos de uma conversa
 */
export async function listConversationFollowupEvents(
  conversationId: string,
  limit = 50
): Promise<FollowupEvent[]> {
  const { data, error } = await supabase
    .from('followup_events')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Gera display_text amigável a partir do evento
 */
export function buildDisplayText(event: {
  event_type: FollowupEventType
  cadence_type?: string | null
  step_key?: string | null
  reason_label?: string | null
  scheduled_for?: string | null
}): string {
  switch (event.event_type) {
    case 'followup_scheduled':
      return `Follow-up programado para ${formatDateTime(event.scheduled_for)}`
    
    case 'followup_sent':
      return `Follow-up enviado (${event.cadence_type} ${event.step_key})`
    
    case 'followup_blocked':
      return `Follow-up bloqueado: ${event.reason_label}`
    
    case 'followup_skipped':
      return `Follow-up pulado: ${event.reason_label}`
    
    case 'followup_paused':
      return `Cadência pausada: ${event.reason_label}`
    
    case 'bot_retake_suggested':
      return `Retomada sugerida: ${event.reason_label}`
    
    default:
      return `Evento: ${event.event_type}`
  }
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return 'N/A'
  const date = new Date(iso)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
```

**Critérios de aceite:**
- [ ] Funções compilam sem erros TypeScript
- [ ] `recordFollowupEvent()` insere evento no banco
- [ ] `listConversationFollowupEvents()` retorna eventos ordenados
- [ ] `buildDisplayText()` gera textos amigáveis
- [ ] Testes unitários passam

---

#### 5. Instrumentação de Pipelines Atuais

**Arquivos a instrumentar:**
- `src/lib/followup/lead-cadence.ts`
- `src/lib/followup/atendimento-cadence.ts`
- `src/lib/followup/agendado-cadence.ts`
- `src/lib/followup/shared.ts` (em `sendFollowupMessage()`)

**Padrão de instrumentação:**

```typescript
// Exemplo: em sendFollowupMessage() após envio bem-sucedido
import { recordFollowupEvent } from './events'
import { upsertConversationFollowupState } from './state'

// Após envio
await recordFollowupEvent({
  client_id: clientId,
  conversation_id: conversationId,
  contact_id: contactId,
  event_type: 'followup_sent',
  cadence_type: 'lead',
  step_key: 'D1',
  display_text: 'Follow-up enviado (lead D1)',
  sent_at: new Date().toISOString(),
  actor_type: 'system',
  metadata: { message: renderedMessage }
})

await upsertConversationFollowupState({
  client_id: clientId,
  conversation_id: conversationId,
  state: 'active',
  cadence_type: 'lead',
  current_step_key: 'D1',
  total_attempts: (currentState?.total_attempts || 0) + 1,
  last_sent_at: new Date().toISOString(),
  last_event_at: new Date().toISOString()
})
```

**Critérios de aceite:**
- [ ] Toda mensagem enviada gera evento `followup_sent`
- [ ] Todo skip gera evento `followup_skipped` com reason
- [ ] Todo bloqueio gera evento `followup_blocked` com reason
- [ ] Estado é atualizado após cada decisão
- [ ] Comportamento atual é preservado (sem quebra)

---

#### 6. Testes Unitários

**Arquivo:** `tests/followup-state-events.test.ts`

**Casos de teste:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { 
  getConversationFollowupState,
  upsertConversationFollowupState,
  transitionFollowupState
} from '@/lib/followup/state'
import {
  recordFollowupEvent,
  listConversationFollowupEvents,
  buildDisplayText
} from '@/lib/followup/events'

describe('Follow-up State', () => {
  it('should return null for non-existent conversation', async () => {
    const state = await getConversationFollowupState('non-existent-uuid')
    expect(state).toBeNull()
  })

  it('should create new state', async () => {
    const state = await upsertConversationFollowupState({
      client_id: 'test-client',
      conversation_id: 'test-conv',
      state: 'eligible',
      reason_code: 'test',
      reason_label: 'Test'
    })
    expect(state.state).toBe('eligible')
  })

  it('should update existing state', async () => {
    // ... criar estado inicial
    // ... atualizar
    // ... verificar mudança
  })

  it('should transition state correctly', async () => {
    // ... criar estado inicial
    const newState = await transitionFollowupState('test-conv', 'scheduled', {
      code: 'test',
      label: 'Test transition'
    })
    expect(newState.state).toBe('scheduled')
  })
})

describe('Follow-up Events', () => {
  it('should record event', async () => {
    const event = await recordFollowupEvent({
      client_id: 'test-client',
      conversation_id: 'test-conv',
      event_type: 'followup_sent',
      display_text: 'Test event',
      actor_type: 'system'
    })
    expect(event.event_type).toBe('followup_sent')
  })

  it('should list events by conversation', async () => {
    // ... criar múltiplos eventos
    const events = await listConversationFollowupEvents('test-conv')
    expect(events.length).toBeGreaterThan(0)
  })

  it('should build display text correctly', () => {
    const text = buildDisplayText({
      event_type: 'followup_scheduled',
      scheduled_for: '2026-05-08T09:00:00Z'
    })
    expect(text).toContain('programado')
  })
})
```

**Critérios de aceite:**
- [ ] Todos os testes passam
- [ ] Cobertura > 80% nas funções de state e events
- [ ] Testes rodam em < 5 segundos

---

## 🚀 Próximos Passos Após Fase 1

1. **Validar em staging:**
   - Deploy das migrations
   - Testar criação de estado/eventos
   - Verificar RLS funciona corretamente

2. **Monitorar por 2-3 dias:**
   - Ver se eventos são registrados corretamente
   - Verificar se há overhead de performance
   - Validar que estados fazem sentido

3. **Iniciar Fase 2: Motor de Decisão**
   - Branch `feat/followup-v2-phase-2`
   - Criar `src/lib/followup/evaluator.ts`
   - Centralizar todas as regras de decisão
   - Migrar pipelines para usar `evaluateFollowupDecision()`

---

**Autor:** CTO ChatSales  
**Data:** 2026-05-07 15:30:00  
**Status:** Pronto para começar Fase 1
