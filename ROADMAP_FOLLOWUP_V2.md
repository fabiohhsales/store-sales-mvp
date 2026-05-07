# Roadmap — Reestruturação de Follow-ups e Observabilidade Operacional

**Projeto:** ChatSales Painel Admin  
**Data de criação:** 2026-05-07  
**Versão:** 2.0  
**Owner:** CTO ChatSales  

---

## 📋 Índice

1. [Visão Executiva](#visão-executiva)
2. [Contexto e Motivação](#contexto-e-motivação)
3. [Arquitetura Atual vs. Arquitetura Alvo](#arquitetura-atual-vs-arquitetura-alvo)
4. [Fases de Implementação](#fases-de-implementação)
   - [Fase 0: Diagnóstico e Auditoria](#fase-0-diagnóstico-e-auditoria)
   - [Fase 1: Estado e Eventos](#fase-1-estado-e-eventos)
   - [Fase 2: Motor de Decisão](#fase-2-motor-de-decisão)
   - [Fase 3: UI de Visibilidade](#fase-3-ui-de-visibilidade)
   - [Fase 4: Retomada de Humano Parado](#fase-4-retomada-de-humano-parado)
   - [Fase 5: IA Contextual](#fase-5-ia-contextual)
5. [Métricas de Sucesso](#métricas-de-sucesso)
6. [Riscos e Mitigação](#riscos-e-mitigação)
7. [Apêndices](#apêndices)

---

## Visão Executiva

### Objetivo

Transformar o sistema de follow-up de uma automação "caixa-preta" em um **fluxo operacional transparente, auditável, configurável e confiável**.

### Problema Central

Hoje, operadores e clientes não conseguem responder com clareza:

- ✅ "Esse lead vai receber follow-up?"
- ✅ "Quando?"
- ✅ "Por quê?"
- ❌ "E se não receber, qual é o motivo?"
- ❌ "O que está bloqueando?"
- ❌ "Quem está em risco de cair no esquecimento?"

### Solução

Criar **quatro camadas operacionais**:

1. **Motor de decisão centralizado** — regras de elegibilidade unificadas
2. **Estado de follow-up por conversa** — status atual legível (programado, bloqueado, ativo, etc.)
3. **Eventos visíveis na timeline** — auditoria completa de decisões
4. **Interface operacional preditiva** — Desk, Kanban e Central mostram o que VAI acontecer

### Entregáveis Principais

| Entrega | Impacto |
|---|---|
| Tabelas de estado (`conversation_followup_state`) | Estado atual e próximo agendado por conversa |
| Tabela de eventos (`followup_events`) | Histórico auditável de todas as decisões |
| Tabela de jobs (`followup_jobs`) | Controle de envios futuros |
| Motor de decisão (`evaluateFollowupDecision`) | Centraliza todas as regras |
| Timeline de eventos no Desk | Transparência operacional |
| Central de Follow-ups remodelada | Visão preditiva (programados, elegíveis, bloqueados) |
| Sistema de retomada inteligente | Detecta conversas humanas paradas e sugere ação |

### Timeline Estimado

| Fase | Duração | Esforço (dev-days) |
|---|---|---|
| Fase 0: Diagnóstico | 3 dias | 2 |
| Fase 1: Estado e Eventos | 1 semana | 5 |
| Fase 2: Motor de Decisão | 2 semanas | 8 |
| Fase 3: UI de Visibilidade | 2 semanas | 10 |
| Fase 4: Retomada Humano | 1,5 semanas | 6 |
| Fase 5: IA Contextual | 2 semanas | 8 |
| **Total** | **≈ 8 semanas** | **39 dev-days** |

---

## Contexto e Motivação

### Estado Atual

O sistema já possui:

- ✅ Cadências separadas (`lead`, `atendimento`, `agendado`)
- ✅ Steps dinâmicos configuráveis via JSONB (`lead_followup_steps`, etc.)
- ✅ Tabela de idempotência (`followup_cadence_steps`)
- ✅ Logs básicos (`followup_logs`)
- ✅ Sistema de alertas (`followup_alerts`)
- ✅ Supressões manuais (`followup_cadence_suppressions`)
- ✅ Central de Follow-ups com filtros básicos
- ✅ Envio manual

### Gaps Críticos

❌ **Não há estado consolidado por conversa**
- Impossível saber rapidamente se uma conversa está "programada", "bloqueada" ou "em esteira"

❌ **Decisões de skip são invisíveis**
- Quando o sistema não envia, não fica claro o motivo
- Operador suspeita de falha mesmo em skips corretos

❌ **Desk e Kanban não refletem follow-up**
- Cards não mostram próximo envio programado
- Não há badges de "follow-up ativo", "retomada sugerida", "humano parado"

❌ **Conversas humanas paradas viram buraco negro**
- Quando humano assume e fica parado por 23h+, o sistema não age
- Não há recomendação de retomada

❌ **Central de Follow-ups é reativa, não preditiva**
- Mostra histórico e estado de cadência, mas não "quem será acionado amanhã às 9h"

### Impacto no Negócio

- **Desconfiança dos clientes** sobre o funcionamento do sistema
- **Leads esquecidos** em conversas humanas paradas
- **Retrabalho operacional** para validar se automação está rodando
- **Ansiedade do time** por falta de visibilidade

---

## Arquitetura Atual vs. Arquitetura Alvo

### Arquitetura Atual (Simplificada)

```text
Cron job roda a cada 30min
  ↓
Busca conversas com last_outgoing_at > X horas
  ↓
Checa elegibilidade por cadência
  ↓
Se elegível, envia mensagem + registra em followup_cadence_steps
  ↓
Se não elegível, skip silencioso (sem registro de motivo)
```

**Problema:** decisões espalhadas, sem estado centralizado, skip invisível.

---

### Arquitetura Alvo

```text
Cron job roda a cada 15min
  ↓
Para cada conversa ativa:
  1. evaluateFollowupDecision(conversation) → FollowupDecision
  2. recordFollowupEvent(decision)
  3. upsertConversationFollowupState(decision)
  4. IF action = 'send_now' → enviar + atualizar estado
  5. IF action = 'schedule' → criar followup_job
  6. IF action = 'block' → registrar motivo
  ↓
followup_jobs → processador dedicado executa envios programados
  ↓
Desk/Kanban/Central leem de conversation_followup_state + followup_jobs
```

**Vantagens:**

- ✅ Decisão centralizada e auditável
- ✅ Estado atual legível por qualquer interface
- ✅ Jobs programados explícitos
- ✅ Skip com motivo registrado
- ✅ Timeline mostra eventos sistêmicos

---

## Fases de Implementação

---

## Fase 0: Diagnóstico e Auditoria

**Objetivo:** Mapear comportamento atual, validar integridade e criar baseline de métricas.

**Duração:** 3 dias  
**Esforço:** 2 dev-days  
**Dependências:** Nenhuma  
**Owner:** Dev ChatSales + Suporte ChatSales  

---

### Entregas

| # | Entrega | Descrição |
|---|---|---|
| 0.1 | Mapa de pontos de envio | Todos os arquivos que disparam follow-up |
| 0.2 | Mapa de pontos de skip | Todos os pontos que impedem envio |
| 0.3 | Análise de tabelas atuais | Estado de `followup_cadence_steps`, `followup_logs`, `followup_alerts`, `followup_cadence_suppressions` |
| 0.4 | Lista de reason codes atuais | Todos os motivos de skip identificados no código |
| 0.5 | Query de conversas candidatas | SQL para listar todas as conversas que deveriam ser avaliadas |
| 0.6 | Validação de duplicações | Checar se há envios duplicados |
| 0.7 | Validação de cron | Conferir frequência e logs de execução |
| 0.8 | Validação de horários | Conferir se `working_hours` está sendo respeitado |
| 0.9 | Baseline de métricas | Quantidade atual de conversas em follow-up, taxa de resposta, etc. |

---

### Especificações Técnicas

#### 0.1 — Mapa de pontos de envio

**Objetivo:** Listar todos os arquivos e funções que disparam mensagens de follow-up.

**Método:**

```bash
grep -r "followup" src/app/api/cron src/lib/followup --include="*.ts"
grep -r "sendEvolutionMessage" src/lib/followup --include="*.ts"
```

**Deliverable:** Arquivo `FOLLOWUP_AUDIT_SEND_POINTS.md` com:

- Caminho do arquivo
- Função/linha
- Tipo de cadência
- Condição de disparo

**Exemplo esperado:**

```markdown
## Pontos de Envio de Follow-up

### src/app/api/cron/followup-lead/route.ts
- Função: `POST handler`
- Cadência: `lead`
- Condição: `last_outgoing_at > X dias`
- Envia: Via Evolution API

### src/app/api/followups/[conversationId]/send/route.ts
- Função: `POST handler`
- Cadência: Qualquer
- Condição: Envio manual
- Envia: Via Evolution API
```

---

#### 0.2 — Mapa de pontos de skip

**Objetivo:** Listar todos os pontos onde o sistema decide NÃO enviar.

**Método:**

```bash
grep -r "skip\|ignore\|return\|continue" src/lib/followup --include="*.ts" -B 3 -A 1
```

**Deliverable:** Arquivo `FOLLOWUP_AUDIT_SKIP_POINTS.md` com:

- Condição de skip
- Arquivo/linha
- Motivo implícito

**Exemplo esperado:**

```markdown
## Pontos de Skip

### src/lib/followup/eligibility.ts:42
```ts
if (conversation.status === 'resolved') {
  return { eligible: false, reason: 'resolved' }
}
```
- **Motivo:** Conversa finalizada
```

---

#### 0.3 — Análise de tabelas atuais

**Objetivo:** Validar integridade e volume de dados.

**Queries:**

```sql
-- Contagem de steps enviados por cadência
SELECT cadence_type, COUNT(*) as total
FROM followup_cadence_steps
GROUP BY cadence_type;

-- Conversas com cadência ativa
SELECT COUNT(DISTINCT conversation_id) as active_conversations
FROM followup_cadence_steps
WHERE sent_at > now() - interval '30 days';

-- Alertas não resolvidos
SELECT COUNT(*) as unresolved_alerts
FROM followup_alerts
WHERE NOT resolved;

-- Supressões ativas
SELECT COUNT(*) as active_suppressions
FROM followup_cadence_suppressions
WHERE released_at IS NULL;
```

**Deliverable:** Arquivo `FOLLOWUP_AUDIT_DATA.md` com resultados.

---

#### 0.4 — Lista de reason codes atuais

**Objetivo:** Extrair todos os motivos de skip/block existentes no código.

**Método:** Buscar por strings como `reason:`, `skip:`, `block:`, condicionais de retorno.

**Deliverable:** Tabela com:

| Código | Descrição | Arquivo | Linha |
|---|---|---|---|
| `resolved` | Conversa finalizada | `eligibility.ts` | 42 |
| `no_whatsapp` | WhatsApp desconectado | `eligibility.ts` | 58 |
| `outside_hours` | Fora do horário | `scheduler.ts` | 103 |

---

#### 0.5 — Query de conversas candidatas

**Objetivo:** SQL para listar todas as conversas que deveriam ser avaliadas para follow-up.

**Deliverable:** Query SQL documentada:

```sql
-- Conversas candidatas a follow-up de lead
SELECT
  c.id,
  c.client_id,
  ct.name as contact_name,
  c.status,
  c.stage,
  c.last_outgoing_at,
  c.last_outgoing_by,
  ap.id as has_appointment
FROM conversations c
LEFT JOIN contacts ct ON c.contact_id = ct.id
LEFT JOIN appointments ap ON ap.conversation_id = c.id AND ap.status = 'confirmed'
WHERE c.status = 'open'
  AND c.stage NOT IN ('resolved', 'in_service')
  AND c.last_outgoing_by IS NOT NULL
  AND c.last_outgoing_at < now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM ai_pauses WHERE conversation_id = c.id
  )
ORDER BY c.last_outgoing_at ASC;
```

---

#### 0.6 — Validação de duplicações

**Objetivo:** Identificar se há mensagens de follow-up duplicadas.

**Query:**

```sql
SELECT
  conversation_id,
  cadence_type,
  step_key,
  COUNT(*) as duplicates
FROM followup_cadence_steps
GROUP BY conversation_id, cadence_type, step_key
HAVING COUNT(*) > 1;
```

**Ação:** Se houver duplicatas, investigar causa (race condition, falta de unique constraint, etc.).

---

#### 0.7 — Validação de cron

**Objetivo:** Conferir frequência e logs de execução do cron job atual.

**Checklist:**

- [ ] Qual é a rota do cron? (`/api/cron/followup-*`)
- [ ] Qual frequência? (30min, 1h, etc.)
- [ ] Existe log de execução? Onde?
- [ ] Existe retry em caso de falha?
- [ ] Existe timeout?
- [ ] Existe fila ou execução direta?

**Deliverable:** Documento `FOLLOWUP_CRON_AUDIT.md`

---

#### 0.8 — Validação de horários

**Objetivo:** Conferir se `working_hours` do `panel_bot_config` está sendo respeitado.

**Método:**

1. Buscar todas as instâncias onde `working_hours` é lido
2. Validar se a lógica de "dentro do horário" está correta
3. Testar com horários fora do expediente

**Deliverable:** Documento `FOLLOWUP_HOURS_VALIDATION.md` com:

- Função que valida horário
- Casos de teste
- Resultado esperado vs. real

---

#### 0.9 — Baseline de métricas

**Objetivo:** Capturar estado atual para comparação futura.

**Métricas:**

```sql
-- Total de conversas com follow-up ativo
SELECT COUNT(DISTINCT conversation_id) as active_followup
FROM followup_cadence_steps
WHERE sent_at > now() - interval '30 days';

-- Taxa de resposta (conversas que responderam após follow-up)
SELECT
  COUNT(*) FILTER (WHERE last_incoming_at > sent_at) as responded,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE last_incoming_at > sent_at) / COUNT(*), 2) as response_rate_pct
FROM followup_cadence_steps fcs
JOIN conversations c ON c.id = fcs.conversation_id
WHERE fcs.sent_at > now() - interval '30 days';

-- Alertas por tipo
SELECT alert_type, COUNT(*) as total
FROM followup_alerts
WHERE NOT resolved
GROUP BY alert_type;
```

**Deliverable:** Dashboard com métricas em `FOLLOWUP_BASELINE.md`

---

### Critérios de Aceitação

- [ ] Todos os pontos de envio mapeados
- [ ] Todos os pontos de skip mapeados
- [ ] Tabelas auditadas e integridade validada
- [ ] Reason codes catalogados
- [ ] Query de candidatos validada
- [ ] Nenhuma duplicação encontrada ou causa identificada
- [ ] Cron documentado e funcionando
- [ ] Validação de horário implementada e testada
- [ ] Baseline de métricas capturado

---

### Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Descobrir envios duplicados | Média | Alto | Criar unique constraint antes de prosseguir |
| Cron não estar rodando | Baixa | Crítico | Implementar health check |
| Horários não respeitados | Média | Médio | Corrigir antes da Fase 1 |

---

## Fase 1: Estado e Eventos

**Objetivo:** Criar rastreabilidade completa ANTES de mudar automação. Fazer o sistema registrar o que já faz, sem alterar comportamento.

**Duração:** 1 semana  
**Esforço:** 5 dev-days  
**Dependências:** Fase 0 concluída  
**Owner:** Dev ChatSales  

---

### Entregas

| # | Entrega | Descrição |
|---|---|---|
| 1.1 | Migration: `conversation_followup_state` | Tabela de estado consolidado |
| 1.2 | Migration: `followup_events` | Tabela de eventos auditáveis |
| 1.3 | Helpers de estado | `src/lib/followup/state.ts` |
| 1.4 | Helpers de eventos | `src/lib/followup/events.ts` |
| 1.5 | Adapter para envio atual | Envolver lógica existente para registrar eventos |
| 1.6 | API: eventos por conversa | `GET /api/followups/[conversationId]/events` |
| 1.7 | Componente: Timeline de eventos | Mostrar eventos no Desk |
| 1.8 | Testes unitários | Cobertura de state + events |

---

### Especificações Técnicas

#### 1.1 — Migration: `conversation_followup_state`

**Arquivo:** `supabase/migrations/044_conversation_followup_state.sql`

```sql
-- Migration 044: Consolidated follow-up state per conversation
-- Creates a single source of truth for the current follow-up status of each conversation

CREATE TABLE IF NOT EXISTS conversation_followup_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Current state
  state text NOT NULL CHECK (
    state IN (
      'none',                -- No follow-up applicable
      'eligible',            -- Can enter, not scheduled yet
      'scheduled',           -- Next send is scheduled
      'active',              -- Already sent step(s), following cadence
      'paused_by_human',     -- Human took over, automation paused
      'blocked',             -- Rule prevents entry/send
      'recommended_manual',  -- AI recommends, requires approval
      'completed',           -- Cadence finished or goal achieved
      'cancelled',           -- Manually cancelled
      'failed'               -- Technical/config error
    )
  ) DEFAULT 'none',
  
  -- Current cadence info
  cadence_type text CHECK (
    cadence_type IN ('lead', 'atendimento', 'agendado', 'human_retake')
  ),
  current_step_key text,
  current_step_label text,
  total_attempts int DEFAULT 0,
  
  -- Decision reasoning
  reason_code text NOT NULL,
  reason_label text,
  
  -- Next action
  next_action text,
  next_scheduled_for timestamptz,
  
  -- Timestamps
  last_evaluated_at timestamptz DEFAULT now(),
  last_event_at timestamptz DEFAULT now(),
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  
  -- AI confidence (for manual approval flow)
  requires_human_approval boolean DEFAULT false,
  ai_confidence numeric CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE (conversation_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_client_state
  ON conversation_followup_state(client_id, state);

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_next_scheduled
  ON conversation_followup_state(client_id, next_scheduled_for)
  WHERE next_scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_followup_state_requires_approval
  ON conversation_followup_state(client_id, requires_human_approval)
  WHERE requires_human_approval = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_conversation_followup_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_followup_state_updated_at
  BEFORE UPDATE ON conversation_followup_state
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_followup_state_updated_at();

-- Comments
COMMENT ON TABLE conversation_followup_state IS 'Single source of truth for current follow-up status per conversation';
COMMENT ON COLUMN conversation_followup_state.state IS 'Current state: none, eligible, scheduled, active, paused_by_human, blocked, recommended_manual, completed, cancelled, failed';
COMMENT ON COLUMN conversation_followup_state.reason_code IS 'Machine-readable reason code';
COMMENT ON COLUMN conversation_followup_state.next_action IS 'Next action to take: send_now, schedule, block, etc.';
```

**Testes de aceitação:**

```sql
-- Deve permitir insert
INSERT INTO conversation_followup_state (client_id, conversation_id, state, reason_code)
VALUES ('uuid-client', 'uuid-conv', 'scheduled', 'last_message_from_human_no_reply');

-- Deve rejeitar estado inválido
INSERT INTO conversation_followup_state (client_id, conversation_id, state, reason_code)
VALUES ('uuid-client', 'uuid-conv', 'invalid_state', 'test');
-- ERROR: new row for relation "conversation_followup_state" violates check constraint

-- Deve rejeitar conversation_id duplicado
INSERT INTO conversation_followup_state (client_id, conversation_id, state, reason_code)
VALUES ('uuid-client', 'uuid-conv', 'eligible', 'test');
-- ERROR: duplicate key value violates unique constraint

-- Deve atualizar updated_at automaticamente
UPDATE conversation_followup_state SET state = 'active' WHERE conversation_id = 'uuid-conv';
SELECT updated_at > created_at FROM conversation_followup_state WHERE conversation_id = 'uuid-conv';
-- Deve retornar true
```

---

#### 1.2 — Migration: `followup_events`

**Arquivo:** `supabase/migrations/045_followup_events.sql`

```sql
-- Migration 045: Auditable follow-up events
-- Records every decision, action, and state change for full observability

CREATE TABLE IF NOT EXISTS followup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Event type
  event_type text NOT NULL CHECK (
    event_type IN (
      'followup_evaluated',
      'followup_scheduled',
      'followup_sent',
      'followup_skipped',
      'followup_blocked',
      'followup_paused',
      'followup_resumed',
      'followup_cancelled',
      'followup_completed',
      'followup_failed',
      'bot_retake_evaluated',
      'bot_retake_suggested',
      'bot_retake_scheduled',
      'bot_retake_executed',
      'tag_added',
      'tag_removed',
      'state_changed'
    )
  ),
  
  -- Context
  cadence_type text CHECK (
    cadence_type IN ('lead', 'atendimento', 'agendado', 'human_retake')
  ),
  step_key text,
  
  -- State transition
  previous_state text,
  new_state text,
  
  -- Reasoning
  reason_code text NOT NULL,
  reason_label text,
  display_text text NOT NULL, -- User-facing description
  
  -- Timing
  scheduled_for timestamptz,
  sent_at timestamptz,
  
  -- Actor
  actor_type text NOT NULL DEFAULT 'system' CHECK (
    actor_type IN ('system', 'ai', 'human', 'cron', 'api')
  ),
  actor_id uuid, -- panel_users.id if human
  
  -- AI confidence (if AI decided)
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  requires_human_approval boolean DEFAULT false,
  
  -- Additional data
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_followup_events_conversation
  ON followup_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followup_events_client_created
  ON followup_events(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followup_events_type
  ON followup_events(client_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followup_events_scheduled
  ON followup_events(client_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- Comments
COMMENT ON TABLE followup_events IS 'Immutable audit log of all follow-up decisions and actions';
COMMENT ON COLUMN followup_events.display_text IS 'Human-readable description shown in UI timeline';
COMMENT ON COLUMN followup_events.actor_type IS 'Who/what triggered this event: system, ai, human, cron, api';
COMMENT ON COLUMN followup_events.metadata IS 'Additional context (e.g., config snapshot, error details)';
```

**Testes de aceitação:**

```sql
-- Deve permitir múltiplos eventos para mesma conversa
INSERT INTO followup_events (client_id, conversation_id, event_type, reason_code, display_text)
VALUES 
  ('uuid-client', 'uuid-conv', 'followup_evaluated', 'test', 'Test event 1'),
  ('uuid-client', 'uuid-conv', 'followup_scheduled', 'test', 'Test event 2');

-- Deve ordenar por created_at DESC
SELECT event_type FROM followup_events WHERE conversation_id = 'uuid-conv' ORDER BY created_at DESC;
-- Deve retornar: followup_scheduled, followup_evaluated

-- Deve armazenar metadata como JSONB
INSERT INTO followup_events (client_id, conversation_id, event_type, reason_code, display_text, metadata)
VALUES ('uuid-client', 'uuid-conv', 'followup_sent', 'test', 'Sent', '{"message": "Hello"}');

SELECT metadata->>'message' FROM followup_events WHERE event_type = 'followup_sent';
-- Deve retornar: Hello
```

---

#### 1.3 — Helpers de estado

**Arquivo:** `src/lib/followup/state.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { FollowupState, FollowupStateUpdate } from '@/types/followup'

/**
 * Get current follow-up state for a conversation
 */
export async function getConversationFollowupState(
  conversationId: string
): Promise<FollowupState | null> {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from('conversation_followup_state')
    .select('*')
    .eq('conversation_id', conversationId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  
  return data
}

/**
 * Upsert conversation follow-up state
 */
export async function upsertConversationFollowupState(
  update: FollowupStateUpdate
): Promise<void> {
  const supabase = await createServerClient()
  
  const { error } = await supabase
    .from('conversation_followup_state')
    .upsert({
      ...update,
      last_evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'conversation_id',
      ignoreDuplicates: false,
    })
  
  if (error) throw error
}

/**
 * Transition state with validation
 */
export async function transitionFollowupState(
  conversationId: string,
  newState: FollowupState['state'],
  reasonCode: string,
  reasonLabel?: string
): Promise<void> {
  const current = await getConversationFollowupState(conversationId)
  
  // Validate transition (optional: add FSM logic here)
  if (current) {
    // e.g., can't go from 'completed' to 'scheduled' without 'resumed'
    // For now, allow all transitions
  }
  
  await upsertConversationFollowupState({
    conversation_id: conversationId,
    client_id: current?.client_id!, // TODO: pass explicitly
    state: newState,
    reason_code: reasonCode,
    reason_label,
  })
}

/**
 * Get all conversations in a specific state for a client
 */
export async function getConversationsByFollowupState(
  clientId: string,
  state: FollowupState['state']
): Promise<FollowupState[]> {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from('conversation_followup_state')
    .select('*')
    .eq('client_id', clientId)
    .eq('state', state)
    .order('next_scheduled_for', { ascending: true, nullsFirst: false })
  
  if (error) throw error
  return data || []
}

/**
 * Get conversations with follow-up scheduled in time window
 */
export async function getScheduledFollowups(
  clientId: string,
  from: Date,
  to: Date
): Promise<FollowupState[]> {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from('conversation_followup_state')
    .select('*')
    .eq('client_id', clientId)
    .eq('state', 'scheduled')
    .gte('next_scheduled_for', from.toISOString())
    .lte('next_scheduled_for', to.toISOString())
    .order('next_scheduled_for', { ascending: true })
  
  if (error) throw error
  return data || []
}
```

**Tipos TypeScript:** `src/types/followup.ts` (adicionar):

```typescript
export type FollowupStateValue =
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

export interface FollowupState {
  id: string
  client_id: string
  conversation_id: string
  contact_id: string | null
  state: FollowupStateValue
  cadence_type: CadenceType | null
  current_step_key: string | null
  current_step_label: string | null
  total_attempts: number
  reason_code: string
  reason_label: string | null
  next_action: string | null
  next_scheduled_for: string | null
  last_evaluated_at: string
  last_event_at: string
  last_sent_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  requires_human_approval: boolean
  ai_confidence: number | null
  created_at: string
  updated_at: string
}

export interface FollowupStateUpdate {
  conversation_id: string
  client_id: string
  contact_id?: string | null
  state: FollowupStateValue
  cadence_type?: CadenceType | null
  current_step_key?: string | null
  current_step_label?: string | null
  total_attempts?: number
  reason_code: string
  reason_label?: string | null
  next_action?: string | null
  next_scheduled_for?: string | null
  last_sent_at?: string | null
  last_error_at?: string | null
  last_error_message?: string | null
  requires_human_approval?: boolean
  ai_confidence?: number | null
}
```

**Testes:** `tests/followup-state.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { upsertConversationFollowupState, getConversationFollowupState } from '@/lib/followup/state'

describe('followup state helpers', () => {
  const testConversationId = 'test-conv-id'
  const testClientId = 'test-client-id'
  
  beforeEach(async () => {
    // Clean up
    // TODO: setup test DB isolation
  })
  
  it('should upsert and retrieve state', async () => {
    await upsertConversationFollowupState({
      conversation_id: testConversationId,
      client_id: testClientId,
      state: 'scheduled',
      reason_code: 'last_message_from_human_no_reply',
      reason_label: 'Humano falou por último e lead não respondeu',
      next_scheduled_for: new Date(Date.now() + 86400000).toISOString(),
    })
    
    const state = await getConversationFollowupState(testConversationId)
    
    expect(state).not.toBeNull()
    expect(state?.state).toBe('scheduled')
    expect(state?.reason_code).toBe('last_message_from_human_no_reply')
  })
  
  it('should update existing state on upsert', async () => {
    await upsertConversationFollowupState({
      conversation_id: testConversationId,
      client_id: testClientId,
      state: 'eligible',
      reason_code: 'test',
    })
    
    await upsertConversationFollowupState({
      conversation_id: testConversationId,
      client_id: testClientId,
      state: 'scheduled',
      reason_code: 'updated',
    })
    
    const state = await getConversationFollowupState(testConversationId)
    expect(state?.state).toBe('scheduled')
    expect(state?.reason_code).toBe('updated')
  })
})
```

---

#### 1.4 — Helpers de eventos

**Arquivo:** `src/lib/followup/events.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { FollowupEvent, FollowupEventInput } from '@/types/followup'

/**
 * Record a follow-up event
 */
export async function recordFollowupEvent(
  input: FollowupEventInput
): Promise<string> {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from('followup_events')
    .insert({
      ...input,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  
  if (error) throw error
  return data.id
}

/**
 * List events for a conversation
 */
export async function listConversationFollowupEvents(
  conversationId: string,
  limit = 50
): Promise<FollowupEvent[]> {
  const supabase = await createServerClient()
  
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
 * Build user-friendly display text from reason code
 */
export function buildDisplayText(
  eventType: string,
  reasonCode: string,
  reasonLabel?: string,
  metadata?: Record<string, unknown>
): string {
  // Custom logic per event type
  switch (eventType) {
    case 'followup_scheduled':
      return reasonLabel || `Follow-up programado: ${reasonCode}`
    case 'followup_sent':
      return `Mensagem de follow-up enviada`
    case 'followup_blocked':
      return `Follow-up bloqueado: ${reasonLabel || reasonCode}`
    case 'followup_paused':
      return `Follow-up pausado: ${reasonLabel || reasonCode}`
    case 'bot_retake_suggested':
      return `IA sugere retomada: ${reasonLabel || reasonCode}`
    default:
      return reasonLabel || reasonCode
  }
}

/**
 * Get recent events for a client (for Central de Follow-ups)
 */
export async function getClientFollowupEvents(
  clientId: string,
  eventTypes?: string[],
  limit = 100
): Promise<FollowupEvent[]> {
  const supabase = await createServerClient()
  
  let query = supabase
    .from('followup_events')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (eventTypes && eventTypes.length > 0) {
    query = query.in('event_type', eventTypes)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data || []
}
```

**Tipos TypeScript:** `src/types/followup.ts` (adicionar):

```typescript
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

export interface FollowupEvent {
  id: string
  client_id: string
  conversation_id: string
  contact_id: string | null
  event_type: FollowupEventType
  cadence_type: CadenceType | null
  step_key: string | null
  previous_state: string | null
  new_state: string | null
  reason_code: string
  reason_label: string | null
  display_text: string
  scheduled_for: string | null
  sent_at: string | null
  actor_type: 'system' | 'ai' | 'human' | 'cron' | 'api'
  actor_id: string | null
  confidence: number | null
  requires_human_approval: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface FollowupEventInput {
  client_id: string
  conversation_id: string
  contact_id?: string | null
  event_type: FollowupEventType
  cadence_type?: CadenceType | null
  step_key?: string | null
  previous_state?: string | null
  new_state?: string | null
  reason_code: string
  reason_label?: string | null
  display_text: string
  scheduled_for?: string | null
  sent_at?: string | null
  actor_type?: 'system' | 'ai' | 'human' | 'cron' | 'api'
  actor_id?: string | null
  confidence?: number | null
  requires_human_approval?: boolean
  metadata?: Record<string, unknown>
}
```

---

#### 1.5 — Adapter para envio atual

**Objetivo:** Envolver a lógica de envio existente para registrar eventos sem alterar comportamento.

**Estratégia:** Criar um wrapper que:

1. Executa a lógica de envio original
2. Registra evento de sucesso ou falha
3. Atualiza estado

**Exemplo:** `src/lib/followup/send-wrapper.ts`

```typescript
import { recordFollowupEvent } from './events'
import { upsertConversationFollowupState } from './state'
import { sendEvolutionMessage } from '@/lib/evolution/client'

export async function sendFollowupMessageWithTracking(
  conversationId: string,
  clientId: string,
  contactId: string,
  cadenceType: CadenceType,
  stepKey: string,
  message: string,
  evolutionInstanceName: string,
  contactPhone: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // 1. Enviar mensagem (lógica original)
    const result = await sendEvolutionMessage({
      instanceName: evolutionInstanceName,
      to: contactPhone,
      text: message,
    })
    
    if (!result.success) {
      // 2a. Registrar falha
      await recordFollowupEvent({
        client_id: clientId,
        conversation_id: conversationId,
        contact_id: contactId,
        event_type: 'followup_failed',
        cadence_type: cadenceType,
        step_key: stepKey,
        reason_code: 'send_failed',
        reason_label: result.error || 'Erro ao enviar mensagem',
        display_text: `Falha no envio do follow-up: ${result.error}`,
        actor_type: 'system',
        metadata: { error: result.error },
      })
      
      await upsertConversationFollowupState({
        conversation_id: conversationId,
        client_id: clientId,
        contact_id: contactId,
        state: 'failed',
        reason_code: 'send_failed',
        reason_label: result.error,
        last_error_at: new Date().toISOString(),
        last_error_message: result.error,
      })
      
      return { success: false, error: result.error }
    }
    
    // 2b. Registrar sucesso
    await recordFollowupEvent({
      client_id: clientId,
      conversation_id: conversationId,
      contact_id: contactId,
      event_type: 'followup_sent',
      cadence_type: cadenceType,
      step_key: stepKey,
      reason_code: 'step_sent',
      reason_label: `Step ${stepKey} enviado com sucesso`,
      display_text: `Follow-up enviado: ${stepKey}`,
      sent_at: new Date().toISOString(),
      actor_type: 'cron',
      metadata: { message_id: result.messageId },
    })
    
    await upsertConversationFollowupState({
      conversation_id: conversationId,
      client_id: clientId,
      contact_id: contactId,
      state: 'active',
      cadence_type: cadenceType,
      current_step_key: stepKey,
      reason_code: 'step_sent',
      last_sent_at: new Date().toISOString(),
    })
    
    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    // 3. Registrar erro inesperado
    await recordFollowupEvent({
      client_id: clientId,
      conversation_id: conversationId,
      contact_id: contactId,
      event_type: 'followup_failed',
      cadence_type: cadenceType,
      step_key: stepKey,
      reason_code: 'exception',
      reason_label: error.message,
      display_text: `Erro ao enviar follow-up: ${error.message}`,
      actor_type: 'system',
      metadata: { error: error.message, stack: error.stack },
    })
    
    throw error
  }
}
```

**Uso:** Substituir chamadas diretas de `sendEvolutionMessage` por `sendFollowupMessageWithTracking` no cron de follow-up.

---

#### 1.6 — API: eventos por conversa

**Arquivo:** `src/app/api/followups/[conversationId]/events/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { listConversationFollowupEvents } from '@/lib/followup/events'
import { resolveDeskUser } from '@/lib/desk/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params
    const { clientId } = await resolveDeskUser(req)
    
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const events = await listConversationFollowupEvents(conversationId)
    
    // TODO: validate that conversation belongs to clientId
    
    return NextResponse.json({ events })
  } catch (error: any) {
    console.error('Error fetching followup events:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

**Teste manual:**

```bash
curl -X GET "http://localhost:3000/api/followups/{conversationId}/events" \
  -H "Cookie: {auth-cookie}"
```

---

#### 1.7 — Componente: Timeline de eventos

**Objetivo:** Mostrar eventos sistêmicos no meio da timeline da conversa no Desk.

**Arquivo:** `src/components/desk/followup-event-card.tsx`

```typescript
'use client'

import type { FollowupEvent } from '@/types/followup'
import { Clock, AlertCircle, CheckCircle, XCircle, Zap } from 'lucide-react'

interface FollowupEventCardProps {
  event: FollowupEvent
}

export function FollowupEventCard({ event }: FollowupEventCardProps) {
  const icon = getEventIcon(event.event_type)
  const colorClass = getEventColorClass(event.event_type)
  
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${colorClass} bg-muted/30`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 text-sm">
        <div className="font-medium">{event.display_text}</div>
        {event.reason_label && (
          <div className="text-muted-foreground mt-1">
            {event.reason_label}
          </div>
        )}
        {event.scheduled_for && (
          <div className="text-xs text-muted-foreground mt-1">
            Programado para: {new Date(event.scheduled_for).toLocaleString('pt-BR')}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(event.created_at).toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'followup_scheduled':
    case 'bot_retake_scheduled':
      return <Clock className="w-4 h-4 text-blue-500" />
    case 'followup_sent':
    case 'bot_retake_executed':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'followup_blocked':
    case 'followup_cancelled':
      return <XCircle className="w-4 h-4 text-red-500" />
    case 'followup_failed':
      return <AlertCircle className="w-4 h-4 text-orange-500" />
    case 'bot_retake_suggested':
      return <Zap className="w-4 h-4 text-yellow-500" />
    default:
      return <Clock className="w-4 h-4 text-gray-500" />
  }
}

function getEventColorClass(eventType: string) {
  switch (eventType) {
    case 'followup_scheduled':
    case 'bot_retake_scheduled':
      return 'border-blue-200'
    case 'followup_sent':
    case 'bot_retake_executed':
      return 'border-green-200'
    case 'followup_blocked':
    case 'followup_cancelled':
      return 'border-red-200'
    case 'followup_failed':
      return 'border-orange-200'
    case 'bot_retake_suggested':
      return 'border-yellow-200'
    default:
      return 'border-gray-200'
  }
}
```

**Integração no chat:** Modificar `src/components/desk/chat-view.tsx` para intercalar eventos na timeline.

```typescript
// Dentro do componente ChatView, após buscar messages:
const [events, setEvents] = useState<FollowupEvent[]>([])

useEffect(() => {
  fetch(`/api/followups/${conversationId}/events`)
    .then(res => res.json())
    .then(data => setEvents(data.events || []))
}, [conversationId])

// Ao renderizar timeline, intercalar eventos:
const timeline = [...messages, ...events]
  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

return (
  <div className="space-y-2">
    {timeline.map(item => {
      if ('event_type' in item) {
        return <FollowupEventCard key={item.id} event={item} />
      } else {
        return <MessageBubble key={item.id} message={item} />
      }
    })}
  </div>
)
```

---

#### 1.8 — Testes unitários

**Arquivo:** `tests/followup-events.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { recordFollowupEvent, listConversationFollowupEvents, buildDisplayText } from '@/lib/followup/events'

describe('followup events', () => {
  it('should record and retrieve event', async () => {
    const eventId = await recordFollowupEvent({
      client_id: 'test-client',
      conversation_id: 'test-conv',
      event_type: 'followup_scheduled',
      reason_code: 'test',
      display_text: 'Test event',
      actor_type: 'system',
    })
    
    expect(eventId).toBeTruthy()
    
    const events = await listConversationFollowupEvents('test-conv')
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].event_type).toBe('followup_scheduled')
  })
  
  it('should build correct display text', () => {
    const text1 = buildDisplayText('followup_blocked', 'outside_hours', 'Fora do horário')
    expect(text1).toBe('Follow-up bloqueado: Fora do horário')
    
    const text2 = buildDisplayText('followup_sent', 'step_sent')
    expect(text2).toBe('Mensagem de follow-up enviada')
  })
})
```

---

### Critérios de Aceitação — Fase 1

- [ ] Migration `conversation_followup_state` aplicada e testada
- [ ] Migration `followup_events` aplicada e testada
- [ ] Helpers de estado implementados e testados
- [ ] Helpers de eventos implementados e testados
- [ ] Lógica de envio envolvida com tracking
- [ ] API de eventos retorna dados corretos
- [ ] Timeline do Desk mostra eventos sistêmicos
- [ ] Cobertura de testes > 80%

---

### Riscos — Fase 1

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Performance de leitura de eventos na timeline | Média | Médio | Limitar a 50 eventos recentes, paginar se necessário |
| Eventos duplicados por race condition | Baixa | Baixo | Aceitar duplicatas temporariamente, corrigir na Fase 2 |
| Schema de estado incompleto | Média | Médio | Iterar rapidamente com feedback do time |

---

## Fase 2: Motor de Decisão

**Objetivo:** Centralizar todas as regras de elegibilidade em uma única função, eliminar lógica espalhada, e registrar motivos de skip.

**Duração:** 2 semanas  
**Esforço:** 8 dev-days  
**Dependências:** Fase 1 concluída  
**Owner:** Dev ChatSales  

---

### Entregas

| # | Entrega | Descrição |
|---|---|---|
| 2.1 | Motor de decisão | `src/lib/followup/evaluator.ts` |
| 2.2 | Orquestrador de execução | `src/lib/followup/orchestrator.ts` |
| 2.3 | Matriz de elegibilidade | Tabela de decisões consolidada |
| 2.4 | Reason codes completos | Catálogo de todos os motivos |
| 2.5 | Adaptação: cadência de lead | Migrar lógica para o motor |
| 2.6 | Adaptação: cadência de atendimento | Migrar lógica para o motor |
| 2.7 | Adaptação: cadência de agendado | Migrar lógica para o motor |
| 2.8 | Testes de integração | Cobertura end-to-end |
| 2.9 | Endpoint de diagnóstico | `POST /api/followups/diagnose` |

---

### Especificações Técnicas

#### 2.1 — Motor de decisão

**Arquivo:** `src/lib/followup/evaluator.ts`

```typescript
import type { FollowupDecisionInput, FollowupDecision } from '@/types/followup'

/**
 * Central decision engine for follow-up eligibility and action
 * 
 * This function is the ONLY place where follow-up logic should exist.
 * All cadences, cron jobs, and manual triggers must call this function.
 */
export async function evaluateFollowupDecision(
  input: FollowupDecisionInput
): Promise<FollowupDecision> {
  // 1. Pre-flight checks (hard blocks)
  const preflightCheck = checkPreflight(input)
  if (!preflightCheck.eligible) {
    return {
      eligible: false,
      action: 'block',
      state: 'blocked',
      reason_code: preflightCheck.reason_code,
      reason_label: preflightCheck.reason_label,
      display_text: preflightCheck.display_text,
    }
  }
  
  // 2. Conversation status checks
  const statusCheck = checkConversationStatus(input)
  if (!statusCheck.eligible) {
    return {
      eligible: false,
      action: 'block',
      state: 'blocked',
      reason_code: statusCheck.reason_code,
      reason_label: statusCheck.reason_label,
      display_text: statusCheck.display_text,
    }
  }
  
  // 3. Last message analysis (who spoke last?)
  const lastMessageCheck = analyzeLastMessage(input)
  if (lastMessageCheck.action === 'block') {
    return {
      eligible: false,
      action: 'block',
      state: 'blocked',
      reason_code: lastMessageCheck.reason_code,
      reason_label: lastMessageCheck.reason_label,
      display_text: lastMessageCheck.display_text,
    }
  }
  
  // 4. Determine cadence type
  const cadenceType = determineCadenceType(input)
  if (!cadenceType) {
    return {
      eligible: false,
      action: 'do_nothing',
      state: 'none',
      reason_code: 'no_applicable_cadence',
      reason_label: 'Nenhuma cadência aplicável',
      display_text: 'Conversa não se enquadra em nenhuma cadência de follow-up',
    }
  }
  
  // 5. Get next eligible step
  const nextStep = findNextEligibleStep(input, cadenceType)
  if (!nextStep) {
    return {
      eligible: false,
      action: 'complete',
      state: 'completed',
      cadence_type: cadenceType,
      reason_code: 'no_eligible_step',
      reason_label: 'Nenhum step elegível na cadência',
      display_text: 'Cadência de follow-up concluída',
    }
  }
  
  // 6. Check working hours
  const hoursCheck = checkWorkingHours(input, nextStep.window_hours)
  if (!hoursCheck.withinHours) {
    const scheduledFor = hoursCheck.nextAvailable
    return {
      eligible: true,
      action: 'schedule',
      state: 'scheduled',
      cadence_type: cadenceType,
      step_key: nextStep.key,
      step_label: nextStep.label,
      scheduled_for: scheduledFor?.toISOString(),
      reason_code: 'outside_working_hours',
      reason_label: 'Fora do horário permitido',
      display_text: `Follow-up programado para ${scheduledFor?.toLocaleString('pt-BR')}`,
      message_template: nextStep.message,
    }
  }
  
  // 7. Decision: send now
  return {
    eligible: true,
    action: 'send_now',
    state: 'active',
    cadence_type: cadenceType,
    step_key: nextStep.key,
    step_label: nextStep.label,
    reason_code: 'step_eligible',
    reason_label: `Step ${nextStep.label} elegível para envio`,
    display_text: `Enviando follow-up: ${nextStep.label}`,
    message_template: nextStep.message,
    rendered_message: renderMessage(nextStep.message, input),
    confidence: 0.95,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────────────────────

function checkPreflight(input: FollowupDecisionInput) {
  // WhatsApp config
  if (!input.whatsappConfig || input.whatsappConfig.connection_status !== 'open') {
    return {
      eligible: false,
      reason_code: 'no_whatsapp_config',
      reason_label: 'WhatsApp não conectado',
      display_text: 'Follow-up bloqueado: WhatsApp desconectado',
    }
  }
  
  // Contact identifier
  if (!input.contact.phone_number && !input.contact.identifier) {
    return {
      eligible: false,
      reason_code: 'missing_contact_channel',
      reason_label: 'Sem telefone ou identificador',
      display_text: 'Follow-up bloqueado: contato sem telefone',
    }
  }
  
  return { eligible: true }
}

function checkConversationStatus(input: FollowupDecisionInput) {
  // Resolved conversations
  if (input.conversation.status === 'resolved') {
    return {
      eligible: false,
      reason_code: 'conversation_resolved',
      reason_label: 'Conversa finalizada',
      display_text: 'Follow-up bloqueado: conversa já foi finalizada',
    }
  }
  
  // AI paused (human active)
  // Note: in Phase 4, this will be refined to detect stagnation
  if (input.conversation.stage === 'in_service') {
    return {
      eligible: false,
      reason_code: 'human_active',
      reason_label: 'Conversa em atendimento humano',
      display_text: 'Follow-up pausado: humano está atendendo',
    }
  }
  
  return { eligible: true }
}

function analyzeLastMessage(input: FollowupDecisionInput) {
  const { last_message_sender_type, last_incoming_at, last_outgoing_at } = input.conversation
  
  // Lead spoke last and recently (< 2h)
  if (last_message_sender_type === 'lead' && last_incoming_at) {
    const hoursSinceIncoming = (input.now.getTime() - new Date(last_incoming_at).getTime()) / (1000 * 60 * 60)
    if (hoursSinceIncoming < 2) {
      return {
        action: 'block',
        reason_code: 'lead_responded_recently',
        reason_label: 'Lead respondeu recentemente',
        display_text: 'Follow-up bloqueado: lead acabou de responder',
      }
    }
  }
  
  return { action: 'proceed' }
}

function determineCadenceType(input: FollowupDecisionInput): CadenceType | null {
  const { botConfig, appointments } = input
  
  // Priority 1: Has future confirmed appointment → agendado
  const hasConfirmedAppointment = appointments?.some(
    apt => apt.status === 'confirmed' && new Date(apt.start_at) > input.now
  )
  if (hasConfirmedAppointment) {
    return 'agendado'
  }
  
  // Priority 2: In human service → atendimento
  if (input.conversation.stage === 'in_service' || input.conversation.stage === 'awaiting_human') {
    if (botConfig.atendimento_followup_enabled) {
      return 'atendimento'
    }
  }
  
  // Priority 3: Lead follow-up
  if (botConfig.lead_followup_enabled) {
    return 'lead'
  }
  
  return null
}

interface EligibleStep {
  key: string
  label: string
  message: string
  window_hours: number
}

function findNextEligibleStep(
  input: FollowupDecisionInput,
  cadenceType: CadenceType
): EligibleStep | null {
  const { botConfig, sentSteps, conversation, now } = input
  
  // Get dynamic steps config
  let stepsConfig: any[] = []
  if (cadenceType === 'lead') {
    stepsConfig = botConfig.lead_followup_steps || []
  } else if (cadenceType === 'atendimento') {
    stepsConfig = botConfig.atendimento_followup_steps || []
  } else if (cadenceType === 'agendado') {
    stepsConfig = botConfig.agendado_followup_steps || []
  }
  
  if (stepsConfig.length === 0) return null
  
  // Filter out already sent steps
  const sentStepKeys = sentSteps?.map(s => s.step_key) || []
  const remainingSteps = stepsConfig.filter(step => !sentStepKeys.includes(step.key))
  
  if (remainingSteps.length === 0) return null
  
  // Find first step where window is met
  const lastOutgoingAt = conversation.last_outgoing_at
    ? new Date(conversation.last_outgoing_at)
    : null
  
  if (!lastOutgoingAt) return null
  
  const hoursSinceOutgoing = (now.getTime() - lastOutgoingAt.getTime()) / (1000 * 60 * 60)
  
  const eligibleStep = remainingSteps.find(step => {
    const windowHours = step.window_hours || 24
    return hoursSinceOutgoing >= windowHours
  })
  
  if (!eligibleStep) return null
  
  return {
    key: eligibleStep.key,
    label: eligibleStep.label,
    message: eligibleStep.message,
    window_hours: eligibleStep.window_hours,
  }
}

function checkWorkingHours(
  input: FollowupDecisionInput,
  windowHours: number
): { withinHours: boolean; nextAvailable?: Date } {
  const { botConfig, now } = input
  const workingHours = botConfig.working_hours
  
  if (!workingHours) return { withinHours: true }
  
  // TODO: implement business hours check
  // For now, simplified: allow 8am-8pm
  const currentHour = now.getHours()
  if (currentHour >= 8 && currentHour < 20) {
    return { withinHours: true }
  }
  
  // Schedule for next day 9am
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(9, 0, 0, 0)
  
  return { withinHours: false, nextAvailable: nextDay }
}

function renderMessage(template: string, input: FollowupDecisionInput): string {
  // Replace placeholders
  let message = template
  message = message.replace(/\{contact_name\}/g, input.contact.name || 'cliente')
  message = message.replace(/\{professional_name\}/g, input.botConfig.professional_name || '')
  message = message.replace(/\{business_name\}/g, input.botConfig.business_name || '')
  return message
}
```

**Tipos TypeScript:** `src/types/followup.ts` (adicionar):

```typescript
export interface FollowupDecisionInput {
  clientId: string
  conversationId: string
  contactId?: string | null
  
  conversation: {
    status: string | null
    stage: string | null
    labels: string[] | null
    followup_cadence?: string | null
    last_incoming_at?: string | null
    last_outgoing_at?: string | null
    last_message_at?: string | null
    last_message_sender_type?: 'lead' | 'human' | 'bot' | 'system' | null
    last_outgoing_by?: 'human' | 'ai' | 'bot' | null
    assigned_user_id?: string | null
  }
  
  contact: {
    name?: string | null
    phone_number?: string | null
    identifier?: string | null
  }
  
  botConfig: {
    professional_name?: string | null
    business_name?: string | null
    working_hours?: any
    lead_followup_enabled: boolean
    lead_followup_steps?: any[]
    atendimento_followup_enabled: boolean
    atendimento_followup_steps?: any[]
    agendado_followup_steps?: any[]
  }
  
  whatsappConfig?: {
    connection_status: string
    evolution_instance_name: string
  } | null
  
  appointments?: Array<{
    id: string
    status: string
    start_at: string
  }>
  
  existingState?: FollowupState | null
  
  sentSteps?: Array<{
    cadence_type: string
    step_key: string
    sent_at: string
  }>
  
  now: Date
}

export interface FollowupDecision {
  eligible: boolean
  
  action:
    | 'send_now'
    | 'schedule'
    | 'block'
    | 'pause'
    | 'resume'
    | 'recommend_manual'
    | 'cancel'
    | 'complete'
    | 'do_nothing'
  
  state: FollowupStateValue
  
  cadence_type?: CadenceType | null
  step_key?: string | null
  step_label?: string | null
  
  scheduled_for?: string | null
  
  reason_code: string
  reason_label?: string | null
  display_text: string
  
  message_template?: string | null
  rendered_message?: string | null
  
  requires_human_approval?: boolean
  confidence?: number
  
  metadata?: Record<string, unknown>
}
```

---

#### 2.2 — Orquestrador de execução

**Arquivo:** `src/lib/followup/orchestrator.ts`

```typescript
import { evaluateFollowupDecision } from './evaluator'
import { recordFollowupEvent } from './events'
import { upsertConversationFollowupState } from './state'
import { sendFollowupMessageWithTracking } from './send-wrapper'
import { scheduleFollowupJob } from './jobs'
import type { FollowupDecisionInput } from '@/types/followup'

/**
 * Main orchestrator: evaluates decision and executes action
 */
export async function executeFollowupOrchestration(
  input: FollowupDecisionInput
): Promise<{ success: boolean; action: string; error?: string }> {
  try {
    // 1. Evaluate decision
    const decision = await evaluateFollowupDecision(input)
    
    // 2. Record evaluation event
    await recordFollowupEvent({
      client_id: input.clientId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      event_type: 'followup_evaluated',
      cadence_type: decision.cadence_type,
      step_key: decision.step_key,
      reason_code: decision.reason_code,
      reason_label: decision.reason_label,
      display_text: decision.display_text,
      actor_type: 'system',
      confidence: decision.confidence,
      metadata: { decision },
    })
    
    // 3. Update state
    await upsertConversationFollowupState({
      conversation_id: input.conversationId,
      client_id: input.clientId,
      contact_id: input.contactId,
      state: decision.state,
      cadence_type: decision.cadence_type,
      current_step_key: decision.step_key,
      current_step_label: decision.step_label,
      reason_code: decision.reason_code,
      reason_label: decision.reason_label,
      next_action: decision.action,
      next_scheduled_for: decision.scheduled_for,
      ai_confidence: decision.confidence,
      requires_human_approval: decision.requires_human_approval,
    })
    
    // 4. Execute action
    switch (decision.action) {
      case 'send_now':
        return await executeSendNow(input, decision)
      
      case 'schedule':
        return await executeSchedule(input, decision)
      
      case 'block':
      case 'pause':
      case 'do_nothing':
      case 'complete':
        // Already recorded, no further action
        return { success: true, action: decision.action }
      
      default:
        console.warn(`Unhandled action: ${decision.action}`)
        return { success: true, action: decision.action }
    }
  } catch (error: any) {
    console.error('Orchestration error:', error)
    
    // Record failure event
    await recordFollowupEvent({
      client_id: input.clientId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      event_type: 'followup_failed',
      reason_code: 'orchestration_error',
      reason_label: error.message,
      display_text: `Erro ao processar follow-up: ${error.message}`,
      actor_type: 'system',
      metadata: { error: error.message, stack: error.stack },
    })
    
    return { success: false, action: 'error', error: error.message }
  }
}

async function executeSendNow(
  input: FollowupDecisionInput,
  decision: FollowupDecision
) {
  if (!decision.rendered_message) {
    throw new Error('No message to send')
  }
  
  if (!input.whatsappConfig) {
    throw new Error('No WhatsApp config')
  }
  
  const result = await sendFollowupMessageWithTracking(
    input.conversationId,
    input.clientId,
    input.contactId!,
    decision.cadence_type!,
    decision.step_key!,
    decision.rendered_message,
    input.whatsappConfig.evolution_instance_name,
    input.contact.phone_number || input.contact.identifier!
  )
  
  return { success: result.success, action: 'send_now', error: result.error }
}

async function executeSchedule(
  input: FollowupDecisionInput,
  decision: FollowupDecision
) {
  if (!decision.scheduled_for) {
    throw new Error('No schedule time provided')
  }
  
  await scheduleFollowupJob({
    client_id: input.clientId,
    conversation_id: input.conversationId,
    contact_id: input.contactId,
    cadence_type: decision.cadence_type!,
    step_key: decision.step_key!,
    scheduled_for: decision.scheduled_for,
    message_preview: decision.rendered_message?.substring(0, 100),
    decision_reason_code: decision.reason_code,
    decision_reason_label: decision.reason_label,
  })
  
  await recordFollowupEvent({
    client_id: input.clientId,
    conversation_id: input.conversationId,
    contact_id: input.contactId,
    event_type: 'followup_scheduled',
    cadence_type: decision.cadence_type,
    step_key: decision.step_key,
    scheduled_for: decision.scheduled_for,
    reason_code: decision.reason_code,
    reason_label: decision.reason_label,
    display_text: decision.display_text,
    actor_type: 'system',
  })
  
  return { success: true, action: 'schedule' }
}
```

---

#### 2.3 — Matriz de elegibilidade

**Deliverable:** Documento `FOLLOWUP_DECISION_MATRIX.md` com tabela de todas as regras.

```markdown
# Matriz de Decisão de Follow-up

## Preflight Checks

| Condição | Decisão | Estado | Reason Code |
|---|---|---|---|
| WhatsApp desconectado | Block | blocked | no_whatsapp_config |
| Sem telefone/identifier | Block | blocked | missing_contact_channel |
| Conversa resolvida | Block | blocked | conversation_resolved |

## Last Message Analysis

| Última mensagem | Tempo desde | Decisão | Reason Code |
|---|---|---|---|
| Lead | < 2h | Block | lead_responded_recently |
| Lead | > 2h | Proceed | — |
| Humano | < 24h | Proceed | — |
| Bot/AI | < 24h | Proceed | — |

## Cadence Determination

| Condição | Cadência |
|---|---|
| Tem consulta confirmada futura | agendado |
| Stage = in_service ou awaiting_human | atendimento |
| Nenhuma das anteriores | lead |

## Step Selection

| Condição | Decisão |
|---|---|
| Todos os steps já enviados | Complete |
| Janela do próximo step não atingida | Do nothing |
| Janela atingida + dentro do horário | Send now |
| Janela atingida + fora do horário | Schedule |

## Working Hours

| Hora atual | Decisão |
|---|---|
| 8am - 8pm | Send now |
| Fora do horário | Schedule para próximo dia 9am |
```

---

#### 2.4 — Reason codes completos

**Deliverable:** Arquivo `FOLLOWUP_REASON_CODES.md`

```markdown
# Catálogo de Reason Codes

## Preflight

| Código | Label | Descrição |
|---|---|---|
| `no_whatsapp_config` | WhatsApp não conectado | WhatsApp desconectado ou não configurado |
| `missing_contact_channel` | Sem telefone ou identificador | Contato sem phone_number ou identifier |
| `conversation_resolved` | Conversa finalizada | Conversa já foi resolvida |

## Message Analysis

| Código | Label | Descrição |
|---|---|---|
| `lead_responded_recently` | Lead respondeu recentemente | Lead enviou mensagem há menos de 2h |
| `last_message_from_lead_requires_human` | Última mensagem do lead exige resposta humana | Lead fez pergunta ou pedido que requer atenção humana |

## Cadence

| Código | Label | Descrição |
|---|---|---|
| `no_applicable_cadence` | Nenhuma cadência aplicável | Conversa não se enquadra em nenhuma cadência |
| `no_eligible_step` | Nenhum step elegível | Todos os steps já foram enviados ou janela não atingida |
| `scheduled_appointment_exists` | Já existe agendamento futuro | Não enviar follow-up comercial |

## Working Hours

| Código | Label | Descrição |
|---|---|---|
| `outside_working_hours` | Fora do horário permitido | Mensagem programada para próximo horário válido |

## Execution

| Código | Label | Descrição |
|---|---|---|
| `step_eligible` | Step elegível para envio | Janela atingida e todas as condições satisfeitas |
| `step_sent` | Step enviado com sucesso | Mensagem enviada via Evolution API |
| `send_failed` | Falha no envio | Erro ao enviar mensagem via API |
| `orchestration_error` | Erro de orquestração | Erro inesperado no processamento |

## Human Interaction

| Código | Label | Descrição |
|---|---|---|
| `human_active` | Conversa em atendimento humano | Humano assumiu a conversa |
| `human_stagnated` | Atendimento humano parado | Humano assumiu mas ficou inativo por X horas |
```

---

#### 2.5 a 2.7 — Adaptação das cadências

**Objetivo:** Substituir lógica atual de cada cadência (lead, atendimento, agendado) para usar o motor centralizado.

**Exemplo para lead:** `src/app/api/cron/followup-lead/route.ts`

```typescript
// ANTES (simplificado):
export async function POST() {
  const conversations = await getConversationsForLeadFollowup()
  
  for (const conv of conversations) {
    // Lógica inline de elegibilidade
    if (conv.last_outgoing_at < cutoff) {
      const message = buildMessage(conv)
      await sendMessage(message)
      await recordStep(conv.id, 'lead', 'd1')
    }
  }
}

// DEPOIS:
export async function POST() {
  const conversations = await getAllActiveConversations()
  
  for (const conv of conversations) {
    const input = buildFollowupInput(conv)
    await executeFollowupOrchestration(input)
  }
}

async function buildFollowupInput(conv: any): Promise<FollowupDecisionInput> {
  // Fetch all context
  const contact = await getContact(conv.contact_id)
  const botConfig = await getBotConfig(conv.client_id)
  const whatsappConfig = await getWhatsAppConfig(conv.client_id)
  const appointments = await getAppointments(conv.id)
  const sentSteps = await getSentSteps(conv.id)
  const existingState = await getConversationFollowupState(conv.id)
  
  return {
    clientId: conv.client_id,
    conversationId: conv.id,
    contactId: conv.contact_id,
    conversation: {
      status: conv.status,
      stage: conv.stage,
      labels: conv.labels,
      last_incoming_at: conv.last_incoming_at,
      last_outgoing_at: conv.last_outgoing_at,
      last_message_sender_type: conv.last_message_sender_type,
      last_outgoing_by: conv.last_outgoing_by,
    },
    contact: {
      name: contact.name,
      phone_number: contact.phone_number,
      identifier: contact.identifier,
    },
    botConfig,
    whatsappConfig,
    appointments,
    existingState,
    sentSteps,
    now: new Date(),
  }
}
```

**Ação:** Replicar para as outras cadências (`atendimento`, `agendado`).

---

#### 2.8 — Testes de integração

**Arquivo:** `tests/followup-orchestrator.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { executeFollowupOrchestration } from '@/lib/followup/orchestrator'
import { getConversationFollowupState } from '@/lib/followup/state'
import { listConversationFollowupEvents } from '@/lib/followup/events'

describe('followup orchestrator integration', () => {
  it('should block when WhatsApp disconnected', async () => {
    const input = {
      clientId: 'test-client',
      conversationId: 'test-conv',
      contactId: 'test-contact',
      conversation: { status: 'open', stage: 'bot_triage' },
      contact: { name: 'Test', phone_number: '1234567890' },
      botConfig: { lead_followup_enabled: true, lead_followup_steps: [] },
      whatsappConfig: { connection_status: 'disconnected', evolution_instance_name: 'test' },
      now: new Date(),
    }
    
    const result = await executeFollowupOrchestration(input)
    
    expect(result.action).toBe('block')
    
    const state = await getConversationFollowupState('test-conv')
    expect(state?.state).toBe('blocked')
    expect(state?.reason_code).toBe('no_whatsapp_config')
    
    const events = await listConversationFollowupEvents('test-conv')
    expect(events.some(e => e.event_type === 'followup_evaluated')).toBe(true)
  })
  
  it('should schedule when outside working hours', async () => {
    // TODO: implement
  })
  
  it('should send now when eligible', async () => {
    // TODO: implement
  })
})
```

---

#### 2.9 — Endpoint de diagnóstico

**Objetivo:** Permitir diagnóstico manual de uma conversa sem executar ação.

**Arquivo:** `src/app/api/followups/diagnose/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { evaluateFollowupDecision } from '@/lib/followup/evaluator'
import { resolveDeskUser } from '@/lib/desk/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await resolveDeskUser(req)
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await req.json()
    const { conversationId } = body
    
    // Build input (similar to cron job)
    const input = await buildFollowupInput(conversationId, clientId)
    
    // Evaluate (but do NOT execute)
    const decision = await evaluateFollowupDecision(input)
    
    return NextResponse.json({ decision })
  } catch (error: any) {
    console.error('Diagnose error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

**Uso:** Desk pode ter botão "Diagnosticar Follow-up" que chama este endpoint e mostra a decisão em um modal.

---

### Critérios de Aceitação — Fase 2

- [ ] Motor de decisão centralizado implementado
- [ ] Orquestrador funcionando end-to-end
- [ ] Matriz de elegibilidade documentada
- [ ] Reason codes catalogados
- [ ] Todas as 3 cadências migradas para o motor
- [ ] Testes de integração com cobertura > 80%
- [ ] Endpoint de diagnóstico funcional
- [ ] Nenhum envio duplicado detectado

---

### Riscos — Fase 2

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Lógica do motor incompleta | Alta | Crítico | Testes exaustivos + diagnóstico manual |
| Regressão em cadências existentes | Média | Alto | Deploy gradual, rollback rápido |
| Performance degradada | Baixa | Médio | Benchmark antes e depois |

---

## Fase 3: UI de Visibilidade

**Objetivo:** Tornar o estado de follow-up visível em todas as interfaces (Desk, Kanban, Central).

**Duração:** 2 semanas  
**Esforço:** 10 dev-days  
**Dependências:** Fase 2 concluída  
**Owner:** Dev ChatSales  

---

### Entregas

| # | Entrega | Descrição |
|---|---|---|
| 3.1 | Card de follow-up no Desk | Badge + detalhes no sidebar |
| 3.2 | Badges no Kanban | Estados visuais nos cards |
| 3.3 | Central de Follow-ups remodelada | Abas: Programados, Elegíveis, Bloqueados, Falhas |
| 3.4 | Filtros avançados | Por estado, cadência, motivo, responsável |
| 3.5 | Ações rápidas | Enviar agora, reagendar, cancelar |
| 3.6 | Histórico de decisões | Timeline expandida |
| 3.7 | Dashboard de métricas | Contadores por estado |
| 3.8 | Testes E2E | Cobertura de fluxos completos |

---

### Especificações Técnicas

#### 3.1 — Card de follow-up no Desk

**Componente:** `src/components/desk/followup-status-card.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertCircle, CheckCircle, Zap, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FollowupState } from '@/types/followup'

interface FollowupStatusCardProps {
  conversationId: string
  clientId: string
}

export function FollowupStatusCard({ conversationId, clientId }: FollowupStatusCardProps) {
  const [state, setState] = useState<FollowupState | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch(`/api/followups/${conversationId}/state`)
      .then(res => res.json())
      .then(data => {
        setState(data.state)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [conversationId])
  
  if (loading) return <div className="animate-pulse h-24 bg-muted rounded-lg" />
  if (!state || state.state === 'none') return null
  
  const { icon, color, label } = getStateDisplay(state.state)
  
  return (
    <div className={`border ${color} rounded-lg p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        {icon}
        <div className="font-semibold">{label}</div>
      </div>
      
      {state.state === 'scheduled' && state.next_scheduled_for && (
        <div className="text-sm">
          <div className="text-muted-foreground">Próximo envio:</div>
          <div className="font-medium">
            {new Date(state.next_scheduled_for).toLocaleString('pt-BR')}
          </div>
          {state.current_step_label && (
            <div className="text-muted-foreground text-xs mt-1">
              Step: {state.current_step_label}
            </div>
          )}
        </div>
      )}
      
      {state.state === 'active' && (
        <div className="text-sm">
          <div className="text-muted-foreground">Cadência ativa:</div>
          <div className="font-medium">{state.cadence_type}</div>
          <div className="text-muted-foreground text-xs mt-1">
            Step atual: {state.current_step_label || state.current_step_key}
          </div>
          <div className="text-muted-foreground text-xs">
            Tentativas: {state.total_attempts}
          </div>
        </div>
      )}
      
      {state.state === 'blocked' && (
        <div className="text-sm">
          <div className="text-muted-foreground">Motivo:</div>
          <div className="font-medium">{state.reason_label || state.reason_code}</div>
        </div>
      )}
      
      {state.state === 'recommended_manual' && (
        <div className="text-sm">
          <div className="text-muted-foreground">IA recomenda:</div>
          <div className="font-medium">{state.reason_label}</div>
          {state.ai_confidence && (
            <div className="text-xs text-muted-foreground mt-1">
              Confiança: {Math.round(state.ai_confidence * 100)}%
            </div>
          )}
        </div>
      )}
      
      <div className="flex gap-2 pt-2 border-t">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(`/followups/diagnose?conversation_id=${conversationId}`, '_blank')}
        >
          Diagnosticar
        </Button>
        
        {state.state === 'scheduled' && (
          <>
            <Button size="sm" variant="default">Enviar agora</Button>
            <Button size="sm" variant="ghost">Reagendar</Button>
            <Button size="sm" variant="ghost">Cancelar</Button>
          </>
        )}
        
        {state.state === 'recommended_manual' && (
          <Button size="sm" variant="default">Aprovar envio</Button>
        )}
      </div>
    </div>
  )
}

function getStateDisplay(state: string) {
  switch (state) {
    case 'scheduled':
      return {
        icon: <Clock className="w-5 h-5 text-blue-500" />,
        color: 'border-blue-200 bg-blue-50',
        label: 'Follow-up programado',
      }
    case 'active':
      return {
        icon: <Zap className="w-5 h-5 text-green-500" />,
        color: 'border-green-200 bg-green-50',
        label: 'Em follow-up',
      }
    case 'blocked':
      return {
        icon: <Ban className="w-5 h-5 text-red-500" />,
        color: 'border-red-200 bg-red-50',
        label: 'Follow-up bloqueado',
      }
    case 'recommended_manual':
      return {
        icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
        color: 'border-yellow-200 bg-yellow-50',
        label: 'Retomada sugerida',
      }
    case 'failed':
      return {
        icon: <AlertCircle className="w-5 h-5 text-orange-500" />,
        color: 'border-orange-200 bg-orange-50',
        label: 'Falha no follow-up',
      }
    default:
      return {
        icon: <CheckCircle className="w-5 h-5 text-gray-500" />,
        color: 'border-gray-200 bg-gray-50',
        label: state,
      }
  }
}
```

**Integração:** Adicionar `<FollowupStatusCard />` no sidebar do Desk (`src/components/desk/chat-view.tsx`).

---

#### 3.2 — Badges no Kanban

**Componente:** `src/components/pipeline/conversation-card.tsx` (modificar)

```typescript
// Adicionar ao card:
<div className="flex gap-1 mt-2">
  {followupBadge && (
    <Badge variant={followupBadge.variant} className="text-xs">
      {followupBadge.icon} {followupBadge.text}
    </Badge>
  )}
</div>

// Helper:
function getFollowupBadge(state: FollowupState | null) {
  if (!state || state.state === 'none') return null
  
  switch (state.state) {
    case 'scheduled':
      return {
        variant: 'secondary',
        icon: '⏰',
        text: `Follow-up ${formatRelative(state.next_scheduled_for)}`,
      }
    case 'active':
      return {
        variant: 'default',
        icon: '🔄',
        text: `Em follow-up · Step ${state.total_attempts}`,
      }
    case 'blocked':
      return {
        variant: 'destructive',
        icon: '🚫',
        text: 'Bloqueado',
      }
    case 'recommended_manual':
      return {
        variant: 'warning',
        icon: '💡',
        text: 'Retomada sugerida',
      }
    default:
      return null
  }
}

function formatRelative(dateString: string | null): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const hours = Math.round(diff / (1000 * 60 * 60))
  
  if (hours < 1) return 'em breve'
  if (hours < 24) return `em ${hours}h`
  const days = Math.round(hours / 24)
  return `em ${days}d`
}
```

---

#### 3.3 — Central de Follow-ups remodelada

**Página:** `src/app/(dashboard)/followups-v2/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FollowupsTable } from '@/components/followups/followups-table'
import { useClientId } from '@/hooks/use-client-id'

export default function FollowupsV2Page() {
  const { clientId } = useClientId()
  const [tab, setTab] = useState('scheduled')
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Central de Follow-ups</h1>
        <p className="text-muted-foreground">
          Gestão completa de automações e retomadas
        </p>
      </div>
      
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="scheduled">Programados</TabsTrigger>
          <TabsTrigger value="active">Em esteira</TabsTrigger>
          <TabsTrigger value="eligible">Elegíveis</TabsTrigger>
          <TabsTrigger value="blocked">Bloqueados</TabsTrigger>
          <TabsTrigger value="recommended">Retomada sugerida</TabsTrigger>
          <TabsTrigger value="failed">Falhas</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>
        
        <TabsContent value="scheduled">
          <FollowupsTable
            clientId={clientId!}
            stateFilter="scheduled"
          />
        </TabsContent>
        
        <TabsContent value="active">
          <FollowupsTable
            clientId={clientId!}
            stateFilter="active"
          />
        </TabsContent>
        
        {/* Repeat for other tabs */}
      </Tabs>
    </div>
  )
}
```

**Tabela:** `src/components/followups/followups-table.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { FollowupState } from '@/types/followup'

interface FollowupsTableProps {
  clientId: string
  stateFilter: string
}

export function FollowupsTable({ clientId, stateFilter }: FollowupsTableProps) {
  const [data, setData] = useState<FollowupState[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch(`/api/followups/list?client_id=${clientId}&state=${stateFilter}`)
      .then(res => res.json())
      .then(data => {
        setData(data.states)
        setLoading(false)
      })
  }, [clientId, stateFilter])
  
  if (loading) return <div>Carregando...</div>
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contato</TableHead>
          <TableHead>Cadência</TableHead>
          <TableHead>Step Atual</TableHead>
          <TableHead>Próxima Ação</TableHead>
          <TableHead>Quando</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(state => (
          <TableRow key={state.id}>
            <TableCell>{state.contact_id}</TableCell>
            <TableCell>{state.cadence_type}</TableCell>
            <TableCell>{state.current_step_label || state.current_step_key}</TableCell>
            <TableCell>{state.next_action}</TableCell>
            <TableCell>
              {state.next_scheduled_for
                ? new Date(state.next_scheduled_for).toLocaleString('pt-BR')
                : '—'}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {state.reason_label || state.reason_code}
            </TableCell>
            <TableCell>
              <Button size="sm" variant="ghost">Abrir</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

**API:** `src/app/api/followups/list/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getConversationsByFollowupState } from '@/lib/followup/state'
import { resolveDeskUser } from '@/lib/desk/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { clientId } = await resolveDeskUser(req)
  if (!clientId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const stateFilter = req.nextUrl.searchParams.get('state') || 'scheduled'
  
  const states = await getConversationsByFollowupState(clientId, stateFilter as any)
  
  return NextResponse.json({ states })
}
```

---

### Critérios de Aceitação — Fase 3

- [ ] Card de follow-up visível no Desk com dados corretos
- [ ] Badges aparecem no Kanban
- [ ] Central de Follow-ups com abas funcionais
- [ ] Filtros e ordenação funcionando
- [ ] Ações rápidas (enviar, reagendar, cancelar) implementadas
- [ ] Histórico de decisões acessível
- [ ] Dashboard com métricas atualizado
- [ ] Testes E2E cobrindo fluxos principais

---

*Continuação: Fase 4 e 5 serão adicionadas em próximo turno devido ao tamanho do documento.*

---

## Métricas de Sucesso

### Fase 1-3

| Métrica | Baseline | Meta | Como Medir |
|---|---|---|---|
| Visibilidade de decisões | 0% | 100% | Eventos registrados / total de avaliações |
| Clareza de motivo | 0% | 100% | % de skips com reason_code registrado |
| Tempo para diagnosticar problema | ~30min | < 2min | Time to insight via Central/Desk |
| Confiança da equipe | Subjetiva | +80% satisfação | Survey NPS interno |

---

## Riscos e Mitigação

### Riscos Técnicos

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Performance degradada com eventos | Média | Alto | Índices otimizados, limite de eventos por conversa |
| Migração introduz bugs | Alta | Crítico | Deploy gradual por cliente, rollback rápido |
| Lógica do motor incompleta | Alta | Crítico | Testes exaustivos + diagnóstico manual |

### Riscos de Produto

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| UX confusa | Média | Médio | Protótipos + feedback antecipado |
| Sobrecarga cognitiva | Baixa | Médio | Progressive disclosure, defaults inteligentes |

---

## Apêndices

### A. Glossário

- **Cadência**: Régua temporal de mensagens (lead, atendimento, agendado)
- **Step**: Mensagem individual dentro de uma cadência
- **Estado**: Status atual de follow-up da conversa
- **Evento**: Registro auditável de decisão ou ação
- **Job**: Envio programado futuro
- **Reason code**: Código técnico de motivo
- **Reason label**: Descrição humana do motivo

### B. Referências

- [Plano Ideal Original](./plano_ideal_followups_retomada_bot.md)
- [CLAUDE.md](./CLAUDE.md)
- Migration 004: `supabase/migrations/004_followup_cadence.sql`
- Migration 032: `supabase/migrations/032_followup_dynamic_steps.sql`

---

---

## Fase 4: Retomada de Humano Parado

**Objetivo:** Implementar detecção inteligente e retomada automática (ou sugerida) de conversas em atendimento humano parado.

**Duração:** 1,5 semanas  
**Esforço:** 6 dev-days  
**Dependências:** Fase 2 concluída (motor de decisão)  
**Owner:** Dev ChatSales  

---

### Entregas

| # | Entrega | Descrição |
|---|---|---|
| 4.1 | Configurações de retomada | Adicionar campos ao `panel_bot_config` |
| 4.2 | Detector de estagnação | `src/lib/followup/human-retake.ts` |
| 4.3 | Avaliador de contexto (IA) | `src/lib/followup/context-analyzer.ts` |
| 4.4 | Integração no motor de decisão | Estender `evaluator.ts` |
| 4.5 | Cron job de retomada | `src/app/api/cron/human-retake/route.ts` |
| 4.6 | UI: Aba "Humano parado" | Central de Follow-ups |
| 4.7 | UI: Card de retomada sugerida | Desk |
| 4.8 | Testes de retomada | Cobertura completa |

---

### Especificações Técnicas

#### 4.1 — Configurações de retomada

**Migration:** `supabase/migrations/046_human_retake_config.sql`

```sql
-- Migration 046: Human stagnation retake configuration

ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS human_stagnation_retake_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_stagnation_threshold_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS human_stagnation_action_mode text DEFAULT 'suggest_only' CHECK (
    human_stagnation_action_mode IN (
      'suggest_only',          -- Only create suggestion for human approval
      'schedule_followup',     -- Schedule follow-up automatically
      'send_with_approval',    -- Generate message but require approval
      'send_automatically'     -- Send automatically if high confidence
    )
  ),
  ADD COLUMN IF NOT EXISTS human_stagnation_requires_approval boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS human_stagnation_respect_working_hours boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS human_stagnation_excluded_tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS human_stagnation_excluded_stages text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS human_stagnation_max_attempts_per_conversation integer DEFAULT 3;

COMMENT ON COLUMN panel_bot_config.human_stagnation_retake_enabled IS 'Enable automatic detection and retake of stagnated human conversations';
COMMENT ON COLUMN panel_bot_config.human_stagnation_threshold_hours IS 'Hours of inactivity before considering conversation stagnated';
COMMENT ON COLUMN panel_bot_config.human_stagnation_action_mode IS 'What to do when stagnation is detected';
```

**UI de configuração:** Adicionar seção no `src/app/(dashboard)/my-account/bot-config/page.tsx`

```typescript
<section>
  <h3 className="text-lg font-semibold">Retomada de Humano Parado</h3>
  <p className="text-sm text-muted-foreground mb-4">
    Configure como o sistema deve agir quando conversas em atendimento humano
    ficam paradas por muito tempo.
  </p>
  
  <div className="space-y-4">
    <SwitchField
      name="human_stagnation_retake_enabled"
      label="Ativar retomada de humano parado"
      description="Detecta conversas humanas estagnadas e sugere/executa ação"
    />
    
    <NumberField
      name="human_stagnation_threshold_hours"
      label="Tempo de estagnação (horas)"
      description="Após quantas horas sem atividade considerar parada"
      min={1}
      max={72}
    />
    
    <SelectField
      name="human_stagnation_action_mode"
      label="Modo de ação"
      options={[
        { value: 'suggest_only', label: 'Apenas sugerir (requer aprovação manual)' },
        { value: 'schedule_followup', label: 'Programar follow-up automaticamente' },
        { value: 'send_with_approval', label: 'Gerar mensagem e pedir aprovação' },
        { value: 'send_automatically', label: 'Enviar automaticamente (alta confiança)' },
      ]}
    />
    
    <SwitchField
      name="human_stagnation_respect_working_hours"
      label="Respeitar horário comercial"
    />
    
    <NumberField
      name="human_stagnation_max_attempts_per_conversation"
      label="Máximo de tentativas por conversa"
      min={1}
      max={10}
    />
    
    <TagsField
      name="human_stagnation_excluded_tags"
      label="Tags que bloqueiam retomada"
      description="Conversas com essas tags nunca terão retomada automática"
    />
    
    <MultiSelectField
      name="human_stagnation_excluded_stages"
      label="Etapas que bloqueiam retomada"
      options={stageLabels.map(s => ({ value: s.key, label: s.label }))}
    />
  </div>
</section>
```

---

#### 4.2 — Detector de estagnação

**Arquivo:** `src/lib/followup/human-retake.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { FollowupDecisionInput } from '@/types/followup'

export interface StagnatedConversation {
  id: string
  client_id: string
  contact_id: string | null
  contact_name: string | null
  contact_phone: string | null
  stage: string | null
  assigned_user_id: string | null
  last_outgoing_at: string | null
  last_outgoing_by: string | null
  last_incoming_at: string | null
  hours_stagnated: number
  previous_retake_attempts: number
}

/**
 * Find conversations in human service that are stagnated
 */
export async function findHumanStagnatedConversations(
  clientId: string,
  thresholdHours: number,
  excludedTags: string[] = [],
  excludedStages: string[] = [],
  maxAttempts: number = 3
): Promise<StagnatedConversation[]> {
  const supabase = await createServerClient()
  
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000)
  
  // Query conversations in human service that are stagnated
  const { data, error } = await supabase.rpc('find_stagnated_human_conversations', {
    p_client_id: clientId,
    p_cutoff: cutoff.toISOString(),
    p_excluded_tags: excludedTags,
    p_excluded_stages: excludedStages,
    p_max_attempts: maxAttempts,
  })
  
  if (error) {
    console.error('Error finding stagnated conversations:', error)
    return []
  }
  
  return data || []
}

/**
 * Evaluate whether a stagnated conversation should be retaken by AI
 */
export async function evaluateHumanRetake(
  conversation: StagnatedConversation,
  botConfig: any,
  now: Date
): Promise<{
  should_retake: boolean
  confidence: number
  reason_code: string
  reason_label: string
  suggested_message?: string
  scheduled_for?: Date
}> {
  // Check if already has too many attempts
  if (conversation.previous_retake_attempts >= (botConfig.human_stagnation_max_attempts_per_conversation || 3)) {
    return {
      should_retake: false,
      confidence: 0,
      reason_code: 'max_attempts_reached',
      reason_label: 'Limite de tentativas de retomada atingido',
    }
  }
  
  // Check if conversation has appointment (shouldn't retake commercially)
  const hasAppointment = await checkHasAppointment(conversation.id)
  if (hasAppointment) {
    return {
      should_retake: false,
      confidence: 0,
      reason_code: 'has_appointment',
      reason_label: 'Conversa já tem agendamento',
    }
  }
  
  // Analyze conversation context with AI
  const contextAnalysis = await analyzeConversationContext(conversation.id)
  
  if (contextAnalysis.requires_human_attention) {
    return {
      should_retake: false,
      confidence: contextAnalysis.confidence,
      reason_code: 'requires_human_attention',
      reason_label: 'Contexto exige atenção humana',
    }
  }
  
  // Build suggested message
  const suggestedMessage = await generateRetakeSuggestion(
    conversation,
    contextAnalysis,
    botConfig
  )
  
  // Determine when to send
  let scheduledFor: Date | undefined
  if (botConfig.human_stagnation_respect_working_hours) {
    const nextAvailable = getNextAvailableTime(now, botConfig.working_hours)
    if (nextAvailable > now) {
      scheduledFor = nextAvailable
    }
  }
  
  return {
    should_retake: true,
    confidence: contextAnalysis.confidence,
    reason_code: 'human_stagnated_after_human_message',
    reason_label: `Humano falou por último há ${conversation.hours_stagnated}h sem resposta`,
    suggested_message: suggestedMessage,
    scheduled_for: scheduledFor,
  }
}

/**
 * Process a single stagnated conversation candidate
 */
export async function processHumanRetakeCandidate(
  conversation: StagnatedConversation,
  botConfig: any,
  actionMode: string
): Promise<{ success: boolean; action: string }> {
  const evaluation = await evaluateHumanRetake(conversation, botConfig, new Date())
  
  if (!evaluation.should_retake) {
    // Record skip event
    await recordFollowupEvent({
      client_id: conversation.client_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      event_type: 'bot_retake_evaluated',
      cadence_type: 'human_retake',
      reason_code: evaluation.reason_code,
      reason_label: evaluation.reason_label,
      display_text: `Retomada avaliada: ${evaluation.reason_label}`,
      actor_type: 'ai',
      confidence: evaluation.confidence,
    })
    
    return { success: true, action: 'skipped' }
  }
  
  // Based on action mode
  switch (actionMode) {
    case 'suggest_only':
      return await createRetakeSuggestion(conversation, evaluation)
    
    case 'schedule_followup':
      return await scheduleRetakeFollowup(conversation, evaluation)
    
    case 'send_with_approval':
      return await createRetakeWithApproval(conversation, evaluation)
    
    case 'send_automatically':
      if (evaluation.confidence >= 0.85) {
        return await executeRetakeAutomatically(conversation, evaluation)
      } else {
        return await createRetakeSuggestion(conversation, evaluation)
      }
    
    default:
      return { success: false, action: 'invalid_mode' }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────────────────────

async function checkHasAppointment(conversationId: string): Promise<boolean> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('appointments')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'confirmed')
    .gte('start_at', new Date().toISOString())
    .limit(1)
  
  return (data?.length || 0) > 0
}

async function createRetakeSuggestion(
  conversation: StagnatedConversation,
  evaluation: any
): Promise<{ success: boolean; action: string }> {
  await upsertConversationFollowupState({
    conversation_id: conversation.id,
    client_id: conversation.client_id,
    contact_id: conversation.contact_id,
    state: 'recommended_manual',
    cadence_type: 'human_retake',
    reason_code: evaluation.reason_code,
    reason_label: evaluation.reason_label,
    requires_human_approval: true,
    ai_confidence: evaluation.confidence,
  })
  
  await recordFollowupEvent({
    client_id: conversation.client_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    event_type: 'bot_retake_suggested',
    cadence_type: 'human_retake',
    reason_code: evaluation.reason_code,
    reason_label: evaluation.reason_label,
    display_text: `IA sugere retomada: ${evaluation.reason_label}`,
    actor_type: 'ai',
    confidence: evaluation.confidence,
    requires_human_approval: true,
    metadata: { suggested_message: evaluation.suggested_message },
  })
  
  return { success: true, action: 'suggested' }
}

async function scheduleRetakeFollowup(
  conversation: StagnatedConversation,
  evaluation: any
): Promise<{ success: boolean; action: string }> {
  const scheduledFor = evaluation.scheduled_for || new Date()
  
  await scheduleFollowupJob({
    client_id: conversation.client_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    cadence_type: 'human_retake',
    step_key: 'retake_1',
    scheduled_for: scheduledFor.toISOString(),
    message_preview: evaluation.suggested_message?.substring(0, 100),
    decision_reason_code: evaluation.reason_code,
    decision_reason_label: evaluation.reason_label,
    requires_human_approval: false,
  })
  
  await upsertConversationFollowupState({
    conversation_id: conversation.id,
    client_id: conversation.client_id,
    contact_id: conversation.contact_id,
    state: 'scheduled',
    cadence_type: 'human_retake',
    reason_code: evaluation.reason_code,
    reason_label: evaluation.reason_label,
    next_action: 'send_now',
    next_scheduled_for: scheduledFor.toISOString(),
    ai_confidence: evaluation.confidence,
  })
  
  await recordFollowupEvent({
    client_id: conversation.client_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    event_type: 'bot_retake_scheduled',
    cadence_type: 'human_retake',
    scheduled_for: scheduledFor.toISOString(),
    reason_code: evaluation.reason_code,
    reason_label: evaluation.reason_label,
    display_text: `Retomada programada para ${scheduledFor.toLocaleString('pt-BR')}`,
    actor_type: 'ai',
    confidence: evaluation.confidence,
  })
  
  return { success: true, action: 'scheduled' }
}

async function executeRetakeAutomatically(
  conversation: StagnatedConversation,
  evaluation: any
): Promise<{ success: boolean; action: string }> {
  // TODO: implement send
  // This would be similar to sendFollowupMessageWithTracking
  return { success: false, action: 'not_implemented' }
}

function getNextAvailableTime(now: Date, workingHours: any): Date {
  // Simplified: schedule for next day 9am if outside hours
  const currentHour = now.getHours()
  if (currentHour >= 8 && currentHour < 20) {
    return now
  }
  
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(9, 0, 0, 0)
  return nextDay
}
```

---

#### 4.3 — Avaliador de contexto (IA)

**Arquivo:** `src/lib/followup/context-analyzer.ts`

```typescript
import { createAiClient } from '@/lib/ai/client'

export interface ConversationContextAnalysis {
  requires_human_attention: boolean
  confidence: number
  reason: string
  sentiment: 'positive' | 'neutral' | 'negative'
  has_unanswered_question: boolean
  has_pricing_discussion: boolean
  has_complaint: boolean
  suggested_action: 'send_generic' | 'send_contextual' | 'wait_for_human'
}

/**
 * Analyze conversation context using AI to decide if retake is appropriate
 */
export async function analyzeConversationContext(
  conversationId: string
): Promise<ConversationContextAnalysis> {
  // Fetch last N messages
  const messages = await fetchConversationMessages(conversationId, 10)
  
  if (messages.length === 0) {
    return {
      requires_human_attention: true,
      confidence: 0,
      reason: 'No messages to analyze',
      sentiment: 'neutral',
      has_unanswered_question: false,
      has_pricing_discussion: false,
      has_complaint: false,
      suggested_action: 'wait_for_human',
    }
  }
  
  // Build context summary
  const contextSummary = messages
    .map(m => `[${m.sender_type}]: ${m.content}`)
    .join('\n')
  
  // Call AI
  const ai = createAiClient()
  
  const systemPrompt = `You are a conversation context analyzer for a healthcare appointment booking system.

Analyze the conversation below and determine:
1. Does it require human attention? (e.g., complex question, pricing negotiation, complaint, urgency)
2. Sentiment (positive/neutral/negative)
3. Are there unanswered questions from the patient?
4. Is there pricing/budget discussion?
5. Is there a complaint or negative experience?
6. What action should be taken: send_generic, send_contextual, wait_for_human

Return JSON only.`

  const userPrompt = `Conversation:

${contextSummary}

Return JSON:
{
  "requires_human_attention": boolean,
  "confidence": number (0-1),
  "reason": "string",
  "sentiment": "positive" | "neutral" | "negative",
  "has_unanswered_question": boolean,
  "has_pricing_discussion": boolean,
  "has_complaint": boolean,
  "suggested_action": "send_generic" | "send_contextual" | "wait_for_human"
}`

  try {
    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })
    
    const result = JSON.parse(response.choices[0].message.content || '{}')
    
    return {
      requires_human_attention: result.requires_human_attention ?? true,
      confidence: result.confidence ?? 0,
      reason: result.reason ?? 'Unknown',
      sentiment: result.sentiment ?? 'neutral',
      has_unanswered_question: result.has_unanswered_question ?? false,
      has_pricing_discussion: result.has_pricing_discussion ?? false,
      has_complaint: result.has_complaint ?? false,
      suggested_action: result.suggested_action ?? 'wait_for_human',
    }
  } catch (error) {
    console.error('Error analyzing context:', error)
    return {
      requires_human_attention: true,
      confidence: 0,
      reason: 'Error analyzing',
      sentiment: 'neutral',
      has_unanswered_question: false,
      has_pricing_discussion: false,
      has_complaint: false,
      suggested_action: 'wait_for_human',
    }
  }
}

/**
 * Generate suggested retake message based on context
 */
export async function generateRetakeSuggestion(
  conversation: any,
  contextAnalysis: ConversationContextAnalysis,
  botConfig: any
): Promise<string> {
  const ai = createAiClient()
  
  const systemPrompt = `You are writing a polite follow-up message for a healthcare professional to retake a conversation that has been stagnant.

The message should:
- Be warm and empathetic
- Reference the previous conversation if relevant
- Be concise (max 2 sentences)
- Include a clear call-to-action
- Use only the patient's first name
- Be in the language: ${botConfig.ai_language || 'pt-BR'}`

  const userPrompt = `Context:
- Patient: ${conversation.contact_name}
- Sentiment: ${contextAnalysis.sentiment}
- Has unanswered question: ${contextAnalysis.has_unanswered_question}
- Professional: ${botConfig.professional_name}
- Business: ${botConfig.business_name}

Generate a short, contextual retake message.`

  try {
    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 150,
    })
    
    return response.choices[0].message.content || 'Oi! Está tudo bem? Podemos continuar nossa conversa sobre o agendamento?'
  } catch (error) {
    console.error('Error generating suggestion:', error)
    return 'Oi! Está tudo bem? Podemos continuar nossa conversa sobre o agendamento?'
  }
}

async function fetchConversationMessages(conversationId: string, limit: number) {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('messages')
    .select('content, sender_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  return data || []
}
```

---

#### 4.4 — Integração no motor de decisão

**Modificação:** `src/lib/followup/evaluator.ts`

```typescript
// Adicionar no início da função evaluateFollowupDecision:

// Check for human stagnation BEFORE blocking on in_service
if (input.conversation.stage === 'in_service' || input.conversation.stage === 'awaiting_human') {
  const stagnationCheck = await checkHumanStagnation(input)
  
  if (stagnationCheck.is_stagnated && input.botConfig.human_stagnation_retake_enabled) {
    return {
      eligible: true,
      action: 'recommend_manual', // or other based on config
      state: 'recommended_manual',
      cadence_type: 'human_retake',
      reason_code: stagnationCheck.reason_code,
      reason_label: stagnationCheck.reason_label,
      display_text: stagnationCheck.display_text,
      confidence: stagnationCheck.confidence,
      requires_human_approval: stagnationCheck.requires_approval,
      metadata: { suggested_message: stagnationCheck.suggested_message },
    }
  }
  
  // If not stagnated or retake disabled, block as before
  return {
    eligible: false,
    action: 'block',
    state: 'paused_by_human',
    reason_code: 'human_active',
    reason_label: 'Conversa em atendimento humano',
    display_text: 'Follow-up pausado: humano está atendendo',
  }
}

// Helper function:
async function checkHumanStagnation(input: FollowupDecisionInput) {
  const thresholdHours = input.botConfig.human_stagnation_threshold_hours || 24
  const lastActivity = input.conversation.last_outgoing_at || input.conversation.last_incoming_at
  
  if (!lastActivity) return { is_stagnated: false }
  
  const hoursSince = (input.now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60)
  
  if (hoursSince < thresholdHours) {
    return { is_stagnated: false }
  }
  
  // Conversation is stagnated
  const contextAnalysis = await analyzeConversationContext(input.conversationId)
  
  if (contextAnalysis.requires_human_attention) {
    return {
      is_stagnated: true,
      reason_code: 'human_stagnated_requires_attention',
      reason_label: 'Humano parado mas contexto exige atenção humana',
      display_text: 'Retomada bloqueada: contexto sensível',
      confidence: contextAnalysis.confidence,
      requires_approval: true,
    }
  }
  
  const suggestedMessage = await generateRetakeSuggestion(
    { id: input.conversationId, contact_name: input.contact.name },
    contextAnalysis,
    input.botConfig
  )
  
  return {
    is_stagnated: true,
    reason_code: 'human_stagnated_after_human_message',
    reason_label: `Humano parado há ${Math.round(hoursSince)}h`,
    display_text: `IA sugere retomada: humano inativo há ${Math.round(hoursSince)}h`,
    confidence: contextAnalysis.confidence,
    requires_approval: input.botConfig.human_stagnation_requires_approval,
    suggested_message: suggestedMessage,
  }
}
```

---

#### 4.5 — Cron job de retomada

**Arquivo:** `src/app/api/cron/human-retake/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { findHumanStagnatedConversations, processHumanRetakeCandidate } from '@/lib/followup/human-retake'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createServerClient()
    
    // Get all active clients with retake enabled
    const { data: clients } = await supabase
      .from('panel_clients')
      .select(`
        id,
        panel_bot_config(
          human_stagnation_retake_enabled,
          human_stagnation_threshold_hours,
          human_stagnation_action_mode,
          human_stagnation_excluded_tags,
          human_stagnation_excluded_stages,
          human_stagnation_max_attempts_per_conversation
        )
      `)
      .eq('status', 'active')
    
    if (!clients) {
      return NextResponse.json({ message: 'No clients' })
    }
    
    const results: any[] = []
    
    for (const client of clients) {
      const config = (client as any).panel_bot_config
      
      if (!config?.human_stagnation_retake_enabled) continue
      
      // Find stagnated conversations
      const stagnated = await findHumanStagnatedConversations(
        client.id,
        config.human_stagnation_threshold_hours || 24,
        config.human_stagnation_excluded_tags || [],
        config.human_stagnation_excluded_stages || [],
        config.human_stagnation_max_attempts_per_conversation || 3
      )
      
      console.log(`Client ${client.id}: found ${stagnated.length} stagnated conversations`)
      
      // Process each
      for (const conv of stagnated) {
        const result = await processHumanRetakeCandidate(
          conv,
          config,
          config.human_stagnation_action_mode || 'suggest_only'
        )
        
        results.push({
          client_id: client.id,
          conversation_id: conv.id,
          action: result.action,
          success: result.success,
        })
      }
    }
    
    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error: any) {
    console.error('Human retake cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

**Agendamento:** Adicionar ao cron do EasyPanel para rodar a cada 1h.

---

#### 4.6 — UI: Aba "Humano parado"

**Adicionar em:** `src/app/(dashboard)/followups-v2/page.tsx`

```typescript
<TabsTrigger value="stagnated">Humano parado</TabsTrigger>

// ...

<TabsContent value="stagnated">
  <StagnatedConversationsTable clientId={clientId!} />
</TabsContent>
```

**Componente:** `src/components/followups/stagnated-conversations-table.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function StagnatedConversationsTable({ clientId }: { clientId: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch(`/api/followups/stagnated?client_id=${clientId}`)
      .then(res => res.json())
      .then(data => {
        setData(data.conversations)
        setLoading(false)
      })
  }, [clientId])
  
  if (loading) return <div>Carregando...</div>
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contato</TableHead>
          <TableHead>Responsável</TableHead>
          <TableHead>Tempo Parado</TableHead>
          <TableHead>Última Atividade</TableHead>
          <TableHead>Tentativas</TableHead>
          <TableHead>Status IA</TableHead>
          <TableHead>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(conv => (
          <TableRow key={conv.id}>
            <TableCell>{conv.contact_name}</TableCell>
            <TableCell>{conv.assigned_user_name || '—'}</TableCell>
            <TableCell>
              <Badge variant="destructive">
                {Math.round(conv.hours_stagnated)}h
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(conv.last_outgoing_at || conv.last_incoming_at).toLocaleString('pt-BR')}
            </TableCell>
            <TableCell>{conv.previous_retake_attempts}/3</TableCell>
            <TableCell>
              {conv.followup_state?.state === 'recommended_manual' ? (
                <Badge variant="warning">Retomada sugerida</Badge>
              ) : (
                <Badge variant="secondary">Não avaliado</Badge>
              )}
            </TableCell>
            <TableCell>
              <Button size="sm" variant="ghost">Ver</Button>
              <Button size="sm" variant="default">Aprovar retomada</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

**API:** `src/app/api/followups/stagnated/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { findHumanStagnatedConversations } from '@/lib/followup/human-retake'
import { resolveDeskUser } from '@/lib/desk/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { clientId } = await resolveDeskUser(req)
  if (!clientId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Fetch config
  const supabase = await createServerClient()
  const { data: config } = await supabase
    .from('panel_bot_config')
    .select('*')
    .eq('client_id', clientId)
    .single()
  
  const conversations = await findHumanStagnatedConversations(
    clientId,
    config?.human_stagnation_threshold_hours || 24,
    config?.human_stagnation_excluded_tags || [],
    config?.human_stagnation_excluded_stages || [],
    config?.human_stagnation_max_attempts_per_conversation || 3
  )
  
  return NextResponse.json({ conversations })
}
```

---

#### 4.7 — UI: Card de retomada sugerida

**Modificar:** `src/components/desk/followup-status-card.tsx`

Adicionar caso específico para `state === 'recommended_manual'`:

```typescript
{state.state === 'recommended_manual' && (
  <div className="space-y-3">
    <div className="text-sm">
      <div className="text-muted-foreground">IA recomenda retomada:</div>
      <div className="font-medium">{state.reason_label}</div>
      {state.ai_confidence && (
        <div className="text-xs text-muted-foreground mt-1">
          Confiança: {Math.round(state.ai_confidence * 100)}%
        </div>
      )}
    </div>
    
    {state.metadata?.suggested_message && (
      <div className="bg-muted p-2 rounded text-sm">
        <div className="text-xs text-muted-foreground mb-1">Mensagem sugerida:</div>
        <div>{state.metadata.suggested_message}</div>
      </div>
    )}
    
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="default"
        onClick={() => handleApproveRetake(conversationId)}
      >
        Aprovar e enviar
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleEditRetake(conversationId)}
      >
        Editar mensagem
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handleIgnoreRetake(conversationId)}
      >
        Ignorar
      </Button>
    </div>
  </div>
)}
```

---

#### 4.8 — Testes de retomada

**Arquivo:** `tests/human-retake.integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { findHumanStagnatedConversations, evaluateHumanRetake } from '@/lib/followup/human-retake'

describe('human retake integration', () => {
  it('should find stagnated conversations', async () => {
    // TODO: setup test data
    const stagnated = await findHumanStagnatedConversations('test-client', 24, [], [], 3)
    expect(Array.isArray(stagnated)).toBe(true)
  })
  
  it('should evaluate retake correctly', async () => {
    // TODO: implement
  })
  
  it('should not retake when max attempts reached', async () => {
    // TODO: implement
  })
  
  it('should not retake when has appointment', async () => {
    // TODO: implement
  })
})
```

---

### Critérios de Aceitação — Fase 4

- [ ] Configurações de retomada no `panel_bot_config`
- [ ] Detector de estagnação funcional
- [ ] Avaliador de contexto com IA retornando análise correta
- [ ] Motor de decisão detectando estagnação
- [ ] Cron job de retomada rodando periodicamente
- [ ] Aba "Humano parado" na Central de Follow-ups
- [ ] Card de retomada sugerida no Desk
- [ ] Testes de integração com cobertura > 80%
- [ ] Modo `suggest_only` completamente funcional

---

### Riscos — Fase 4

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| IA sugere retomada em contexto sensível | Média | Alto | Modo `suggest_only` obrigatório na V1 |
| Performance degradada com análise de contexto | Baixa | Médio | Cache de análises, limitar chamadas de IA |
| Clientes não confiam na IA | Média | Médio | Transparência total + controle manual |

---

## Fase 5: IA Contextual e Refinamentos

**Objetivo:** Melhorar a inteligência do motor com análise contextual profunda, mensagens personalizadas e aprendizado.

**Duração:** 2 semanas  
**Esforço:** 8 dev-days  
**Dependências:** Fase 4 concluída  
**Owner:** Dev ChatSales  

---

### Entregas

| # | Entrega | Descrição |
|---|---|---|
| 5.1 | Análise de sentimento refinada | Detectar frustração, urgência, satisfação |
| 5.2 | Personalização de mensagens | Geração dinâmica com contexto |
| 5.3 | Heurísticas de timing | Melhor momento para enviar |
| 5.4 | Feedback loop | Registrar se mensagem foi efetiva |
| 5.5 | Dashboard de performance | Taxa de resposta, efetividade |
| 5.6 | A/B testing de mensagens | Testar variações |
| 5.7 | Alertas inteligentes | Notificar operadores de casos críticos |
| 5.8 | Documentação completa | Guias para operadores |

---

### Especificações Técnicas

#### 5.1 — Análise de sentimento refinada

**Objetivo:** Detectar nuances além de positivo/neutro/negativo.

**Adicionar em:** `src/lib/followup/context-analyzer.ts`

```typescript
export interface RefinedSentimentAnalysis {
  sentiment: 'very_positive' | 'positive' | 'neutral' | 'frustrated' | 'angry'
  urgency_level: 'low' | 'medium' | 'high' | 'critical'
  satisfaction_score: number // 0-10
  detected_emotions: string[] // e.g., ['impatient', 'curious', 'excited']
  risk_of_churn: number // 0-1
}

export async function analyzeRefinedSentiment(
  messages: any[]
): Promise<RefinedSentimentAnalysis> {
  const ai = createAiClient()
  
  const systemPrompt = `You are a sentiment analysis expert for healthcare conversations.

Analyze the emotional state, urgency, satisfaction, and churn risk of the patient based on the conversation.

Return JSON with:
- sentiment: very_positive | positive | neutral | frustrated | angry
- urgency_level: low | medium | high | critical
- satisfaction_score: 0-10
- detected_emotions: array of emotion keywords
- risk_of_churn: 0-1 (probability patient will disengage)`

  const contextSummary = messages
    .map(m => `[${m.sender_type}]: ${m.content}`)
    .join('\n')
  
  try {
    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation:\n\n${contextSummary}\n\nAnalyze and return JSON.` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })
    
    return JSON.parse(response.choices[0].message.content || '{}')
  } catch (error) {
    return {
      sentiment: 'neutral',
      urgency_level: 'low',
      satisfaction_score: 5,
      detected_emotions: [],
      risk_of_churn: 0.5,
    }
  }
}
```

---

#### 5.2 — Personalização de mensagens

**Objetivo:** Gerar mensagens follow-up que referenciam contexto específico.

**Adicionar:** `src/lib/followup/message-generator.ts`

```typescript
import { createAiClient } from '@/lib/ai/client'

export async function generateContextualFollowupMessage(
  conversation: any,
  contextAnalysis: any,
  botConfig: any,
  cadenceType: string,
  stepKey: string
): Promise<string> {
  const ai = createAiClient()
  
  const systemPrompt = `You are a message writer for a healthcare professional's AI assistant.

Write a personalized follow-up message that:
- References previous conversation context
- Matches the patient's sentiment and urgency
- Is warm and empathetic
- Has a clear call-to-action
- Uses only the patient's first name
- Is concise (max 3 sentences)
- Language: ${botConfig.ai_language || 'pt-BR'}
- Tone: ${botConfig.ai_tone || 'professional_friendly'}`

  const firstName = conversation.contact_name?.split(' ')[0] || 'você'
  
  const userPrompt = `Context:
- Patient: ${conversation.contact_name}
- Sentiment: ${contextAnalysis.sentiment}
- Urgency: ${contextAnalysis.urgency_level}
- Previous topic: ${contextAnalysis.previous_topic || 'appointment scheduling'}
- Step: ${stepKey} (${cadenceType} cadence)
- Professional: ${botConfig.professional_name}
- Business: ${botConfig.business_name}

Last messages preview:
${contextAnalysis.last_messages_preview}

Generate a contextual, personalized follow-up message.`

  try {
    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 200,
    })
    
    return response.choices[0].message.content || `Oi ${firstName}! Como posso ajudar?`
  } catch (error) {
    console.error('Error generating message:', error)
    return `Oi ${firstName}! Tudo bem? Conseguiu ver as opções de horário que enviei?`
  }
}
```

---

#### 5.3 — Heurísticas de timing

**Objetivo:** Determinar melhor momento para enviar mensagem (não apenas horário comercial).

**Adicionar:** `src/lib/followup/timing.ts`

```typescript
export interface OptimalTiming {
  send_at: Date
  reason: string
  confidence: number
}

export function calculateOptimalSendTime(
  conversation: any,
  botConfig: any,
  now: Date
): OptimalTiming {
  // Historical analysis: quando o lead costuma responder?
  const contactActivity = analyzeContactActivityPattern(conversation.contact_id)
  
  // Regras heurísticas
  const currentHour = now.getHours()
  const currentDay = now.getDay()
  
  // Avoid late night
  if (currentHour >= 21 || currentHour < 8) {
    const nextMorning = new Date(now)
    nextMorning.setDate(nextMorning.getDate() + (currentHour >= 21 ? 1 : 0))
    nextMorning.setHours(9, 0, 0, 0)
    return {
      send_at: nextMorning,
      reason: 'Programado para horário comercial',
      confidence: 0.9,
    }
  }
  
  // Avoid Sunday
  if (currentDay === 0) {
    const nextMonday = new Date(now)
    nextMonday.setDate(nextMonday.getDate() + 1)
    nextMonday.setHours(10, 0, 0, 0)
    return {
      send_at: nextMonday,
      reason: 'Programado para segunda-feira',
      confidence: 0.85,
    }
  }
  
  // Peak activity hours (10am-12pm, 2pm-4pm)
  if ((currentHour >= 10 && currentHour < 12) || (currentHour >= 14 && currentHour < 16)) {
    return {
      send_at: now,
      reason: 'Horário de pico de atividade',
      confidence: 0.95,
    }
  }
  
  // Otherwise send now (within business hours)
  return {
    send_at: now,
    reason: 'Horário comercial',
    confidence: 0.8,
  }
}

function analyzeContactActivityPattern(contactId: string): any {
  // TODO: query messages table and find typical response times
  return {}
}
```

---

#### 5.4 — Feedback loop

**Objetivo:** Registrar se a mensagem de follow-up foi efetiva (lead respondeu?).

**Adicionar colunas:** `followup_cadence_steps`

```sql
ALTER TABLE followup_cadence_steps
  ADD COLUMN IF NOT EXISTS response_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS time_to_response_seconds integer;

-- Trigger to auto-update when lead responds
CREATE OR REPLACE FUNCTION mark_followup_response()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sender_type = 'lead' THEN
    UPDATE followup_cadence_steps
    SET
      response_received = true,
      response_received_at = NEW.created_at,
      time_to_response_seconds = EXTRACT(EPOCH FROM (NEW.created_at - sent_at))
    WHERE conversation_id = NEW.conversation_id
      AND response_received = false
      AND sent_at < NEW.created_at
      AND sent_at > NEW.created_at - interval '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER followup_response_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION mark_followup_response();
```

---

#### 5.5 — Dashboard de performance

**Página:** `src/app/(dashboard)/followups-v2/analytics/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function FollowupAnalyticsPage() {
  const [metrics, setMetrics] = useState<any>(null)
  
  useEffect(() => {
    fetch('/api/followups/analytics')
      .then(res => res.json())
      .then(data => setMetrics(data))
  }, [])
  
  if (!metrics) return <div>Carregando...</div>
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Analytics de Follow-up</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Taxa de Resposta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {Math.round(metrics.response_rate * 100)}%
            </div>
            <p className="text-sm text-muted-foreground">
              {metrics.total_responses} / {metrics.total_sent} mensagens
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Tempo Médio de Resposta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {Math.round(metrics.avg_response_time_hours)}h
            </div>
            <p className="text-sm text-muted-foreground">
              Média das últimas 30 dias
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Follow-ups Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {metrics.active_followups}
            </div>
            <p className="text-sm text-muted-foreground">
              Conversas em cadência
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* More charts and tables */}
    </div>
  )
}
```

**API:** `src/app/api/followups/analytics/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const { clientId } = await resolveDeskUser(req)
  
  const supabase = await createServerClient()
  
  // Response rate
  const { data: sent } = await supabase
    .from('followup_cadence_steps')
    .select('*')
    .eq('client_id', clientId)
    .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  
  const totalSent = sent?.length || 0
  const totalResponses = sent?.filter(s => s.response_received).length || 0
  const responseRate = totalSent > 0 ? totalResponses / totalSent : 0
  
  // Avg response time
  const responseTimes = sent
    ?.filter(s => s.time_to_response_seconds)
    .map(s => s.time_to_response_seconds) || []
  
  const avgResponseTimeSeconds = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0
  
  const avgResponseTimeHours = avgResponseTimeSeconds / 3600
  
  // Active followups
  const { count: activeFollowups } = await supabase
    .from('conversation_followup_state')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('state', ['scheduled', 'active'])
  
  return NextResponse.json({
    response_rate: responseRate,
    total_sent: totalSent,
    total_responses: totalResponses,
    avg_response_time_hours: avgResponseTimeHours,
    active_followups: activeFollowups || 0,
  })
}
```

---

#### 5.6 — A/B testing de mensagens

**Objetivo:** Testar variações de mensagens para otimizar taxa de resposta.

**Migration:** `supabase/migrations/047_followup_ab_tests.sql`

```sql
CREATE TABLE IF NOT EXISTS followup_ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES panel_clients(id) ON DELETE CASCADE,
  test_name text NOT NULL,
  cadence_type text NOT NULL,
  step_key text NOT NULL,
  variant_a_message text NOT NULL,
  variant_b_message text NOT NULL,
  variant_a_count int DEFAULT 0,
  variant_b_count int DEFAULT 0,
  variant_a_responses int DEFAULT 0,
  variant_b_responses int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- Track which variant was sent to which conversation
ALTER TABLE followup_cadence_steps
  ADD COLUMN IF NOT EXISTS ab_test_id uuid REFERENCES followup_ab_tests(id),
  ADD COLUMN IF NOT EXISTS ab_test_variant text CHECK (ab_test_variant IN ('a', 'b'));
```

Implementação de escolha de variante em `message-generator.ts`:

```typescript
export async function selectABTestVariant(
  clientId: string,
  cadenceType: string,
  stepKey: string
): Promise<{ message: string; testId: string | null; variant: 'a' | 'b' | null }> {
  const supabase = await createServerClient()
  
  // Check if there's an active A/B test
  const { data: test } = await supabase
    .from('followup_ab_tests')
    .select('*')
    .eq('client_id', clientId)
    .eq('cadence_type', cadenceType)
    .eq('step_key', stepKey)
    .eq('is_active', true)
    .single()
  
  if (!test) {
    return { message: '', testId: null, variant: null }
  }
  
  // 50/50 random split
  const variant = Math.random() < 0.5 ? 'a' : 'b'
  const message = variant === 'a' ? test.variant_a_message : test.variant_b_message
  
  // Increment count
  await supabase
    .from('followup_ab_tests')
    .update({
      [`variant_${variant}_count`]: test[`variant_${variant}_count`] + 1,
    })
    .eq('id', test.id)
  
  return { message, testId: test.id, variant }
}
```

---

#### 5.7 — Alertas inteligentes

**Objetivo:** Notificar operadores de casos críticos em tempo real.

**Adicionar:** `src/lib/followup/alerts.ts`

```typescript
export async function triggerFollowupAlert(
  clientId: string,
  conversationId: string,
  alertType: 'high_churn_risk' | 'critical_urgency' | 'negative_sentiment' | 'human_stagnated_long',
  message: string,
  metadata?: any
) {
  const supabase = await createServerClient()
  
  // Record alert
  await supabase.from('followup_alerts').insert({
    client_id: clientId,
    cadence_type: 'system',
    alert_type: alertType,
    message,
    details: metadata,
    resolved: false,
  })
  
  // Notify operators (push notification, email, etc.)
  await notifyOperators(clientId, {
    title: 'Alerta de Follow-up',
    body: message,
    url: `/desk?conversation_id=${conversationId}`,
  })
}

async function notifyOperators(clientId: string, notification: any) {
  // TODO: implement push notifications
  console.log('Notify operators:', notification)
}
```

Uso no motor de decisão:

```typescript
// In evaluateFollowupDecision:
if (contextAnalysis.risk_of_churn > 0.8) {
  await triggerFollowupAlert(
    input.clientId,
    input.conversationId,
    'high_churn_risk',
    `Conversa com alto risco de perda: ${input.contact.name}`,
    { churn_risk: contextAnalysis.risk_of_churn }
  )
}
```

---

#### 5.8 — Documentação completa

**Criar:** `docs/FOLLOWUP_OPERATOR_GUIDE.md`

```markdown
# Guia do Operador — Sistema de Follow-up

## Visão Geral

O sistema de follow-up gerencia automaticamente a comunicação com leads e pacientes através de cadências inteligentes.

## Estados de Follow-up

| Estado | Significado | O que fazer |
|---|---|---|
| **Programado** | Próximo envio está agendado | Aguardar ou enviar manualmente |
| **Em follow-up** | Mensagens já foram enviadas | Monitorar resposta |
| **Bloqueado** | Regra impede envio | Verificar motivo, corrigir se necessário |
| **Retomada sugerida** | IA recomenda retomar conversa parada | Aprovar, editar ou ignorar |
| **Falha** | Erro técnico | Verificar logs, reportar se necessário |

## Como Usar a Central de Follow-ups

### Aba "Programados"

Mostra todas as conversas com envio futuro agendado.

**Ações disponíveis:**
- Enviar agora
- Reagendar
- Cancelar

### Aba "Humano parado"

Mostra conversas em atendimento humano que ficaram inativas por muito tempo.

**Quando uma conversa aparece aqui:**
1. Revise o contexto da conversa
2. Verifique se a IA sugeriu retomada
3. Aprove, edite a mensagem ou ignore

### Diagnóstico

Use o botão "Diagnosticar" no Desk para entender por que uma conversa não está recebendo follow-up.

## Perguntas Frequentes

**P: Por que uma conversa não está recebendo follow-up?**

R: Verifique:
- Status do WhatsApp (precisa estar conectado)
- Se a conversa foi finalizada
- Se há agendamento futuro
- Se o lead respondeu recentemente

**P: Como cancelar o follow-up de uma conversa?**

R: Na Central de Follow-ups, encontre a conversa e clique em "Cancelar".

**P: Posso editar a mensagem antes de enviar?**

R: Sim, quando o estado é "Retomada sugerida" ou ao reagendar um programado.
```

---

### Critérios de Aceitação — Fase 5

- [ ] Análise de sentimento refinada implementada
- [ ] Geração de mensagens contextuais funcional
- [ ] Heurísticas de timing aplicadas
- [ ] Feedback loop registrando respostas
- [ ] Dashboard de performance com métricas corretas
- [ ] A/B testing de mensagens funcional
- [ ] Alertas inteligentes notificando operadores
- [ ] Documentação completa para operadores

---

### Riscos — Fase 5

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Personalização gera mensagens inconsistentes | Média | Médio | Revisão manual de amostras, ajuste de prompts |
| A/B testing com amostra pequena | Alta | Baixo | Exigir mínimo de 50 envios por variante |
| Alertas excessivos (fadiga) | Média | Médio | Throttling, configuração de thresholds |

---

## Métricas de Sucesso — Global

### KPIs Principais

| Métrica | Baseline (hoje) | Meta Fase 3 | Meta Fase 5 |
|---|---|---|---|
| Taxa de resposta a follow-ups | ? | +20% | +40% |
| Conversas humanas paradas > 24h | ? | -50% | -80% |
| Tempo para diagnosticar problema | ~30min | <2min | <30s |
| Confiança da equipe (NPS interno) | ? | +60 | +80 |
| Clareza de decisões (eventos registrados) | 0% | 100% | 100% |

---

## Próximos Passos

### Imediato (Semana 1)

1. ✅ Revisar este roadmap com o time
2. ✅ Priorizar Fase 0 → 1 → 2
3. ⬜ Criar branch `feat/followup-v2`
4. ⬜ Iniciar Fase 0: Diagnóstico

### Sprint 1 (Semanas 1-2)

- Fase 0: Diagnóstico e auditoria
- Fase 1: Estado e eventos

### Sprint 2 (Semanas 3-4)

- Fase 2: Motor de decisão

### Sprint 3 (Semanas 5-6)

- Fase 3: UI de visibilidade

### Sprint 4 (Semanas 7-8)

- Fase 4: Retomada de humano parado
- Fase 5: IA contextual (início)

### Sprint 5+ (Semanas 9+)

- Fase 5: IA contextual (conclusão)
- Refinamentos
- Otimizações

---

## Conclusão

Este roadmap transforma o sistema de follow-up de uma automação opaca em um **fluxo operacional transparente, auditável e inteligente**.

### Benefícios Esperados

**Para operadores:**
- Visibilidade total de o que vai acontecer
- Confiança no sistema
- Menos ansiedade e retrabalho
- Ferramentas para diagnosticar e agir

**Para clientes:**
- Menos leads esquecidos
- Retomada inteligente de conversas paradas
- Mensagens mais contextuais e personalizadas
- Melhor taxa de conversão

**Para o negócio:**
- Diferenciação competitiva
- Melhor NPS
- Escalabilidade operacional
- Dados para otimização contínua

---

**Documento vivo — atualizar conforme o projeto evolui.**

**Versão:** 2.0  
**Última atualização:** 2026-05-07  
**Próxima revisão:** Após Fase 0
