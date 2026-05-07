# Auditoria — Pontos de Envio de Follow-up

**Data:** 2026-05-07  
**Fase:** 0 (Diagnóstico)  
**Objetivo:** Mapear todos os pontos no código que enviam mensagens de follow-up

---

## 1. Estrutura Atual

### 1.1. Tabelas envolvidas

| Tabela | Propósito | Migration |
|---|---|---|
| `followup_cadence_steps` | Idempotência de steps enviados | 004 |
| `followup_logs` | Log de envios | (pré-existente) |
| `followup_cadence_suppressions` | Cancelamentos manuais | 041 |
| `conversations` | Dados da conversa (last_outgoing_at, stage) | — |
| `contacts` | Dados do contato (phone, name) | — |
| `appointments` | Agendamentos (para filtrar conversas) | — |

### 1.2. Arquivos de cadências

| Arquivo | Cadência | Função principal |
|---|---|---|
| `src/lib/followup/lead-cadence.ts` | Lead sem agendamento | `runLeadCadence()` |
| `src/lib/followup/atendimento-cadence.ts` | Pós-atendimento humano | `runAtendimentoCadence()` |
| `src/lib/followup/agendado-cadence.ts` | Lembretes de consulta | `runAgendadoCadence()` |
| `src/lib/followup/shared.ts` | Funções comuns | `sendFollowupMessage()` |

### 1.3. Cron jobs

| Rota | Frequência | Cadências |
|---|---|---|
| `/api/cron/followup-cadencia` | 1h | Lead + Atendimento |
| `/api/cron/followup-agendado` | 5min | Agendado (lembretes) |

---

## 2. Pontos de Envio Mapeados

### 2.1. Lead Cadence (`lead-cadence.ts`)

#### Fluxo de execução:

1. **Validação de horário:**
   ```typescript
   if (!isWithinWorkingHours(ctx.botConfig.working_hours, ctx.botConfig.timezone ?? 'America/Sao_Paulo')) {
     logFollowupSkip('lead', 'fora_do_horario', { clientId: ctx.clientId })
     return 0
   }
   ```

2. **Validação de steps configurados:**
   ```typescript
   const steps = resolveLeadSteps(ctx.botConfig)
   if (!steps.length) {
     logFollowupEvent('lead', 'skipped', { clientId: ctx.clientId, reason: 'no_enabled_steps' })
     return 0
   }
   ```

3. **Query de conversas candidatas:**
   ```sql
   SELECT id, contact_id, stage, last_incoming_at, last_outgoing_at
   FROM conversations
   WHERE client_id = ? AND status != 'resolved' AND last_outgoing_at IS NOT NULL
   LIMIT 500
   ```

   **Filtros pós-query:**
   - Remove conversas suprimidas (tabela `followup_cadence_suppressions`)
   - Remove se `last_incoming_at >= last_outgoing_at` (lead respondeu depois do bot)

4. **Filtro de agendamentos:**
   ```sql
   SELECT conversation_id FROM appointments
   WHERE status = 'scheduled' AND start_at > NOW() AND conversation_id IN (?)
   ```

5. **Iteração por conversa:**
   
   **Skip se:**
   - `stage IN ('in_service', 'awaiting_human')` → log `'em_atendimento_humano'`
   - `last_outgoing_at IS NULL OR contact_id IS NULL` → log `'sem_contato_ou_last_outgoing'`
   - Nenhum step elegível para a janela de tempo → log `'sem_step_elegivel'`
   - Contato não encontrado → log `'contato_nao_encontrado'`
   - `recipient` (identifier ou phone_number) vazio → continue silencioso

   **Envia se:**
   - Todas as validações passam
   - Função: `sendFollowupMessage()` (em `shared.ts`)

#### Steps definidos:

| Step | Label | Min Hours | Max Hours | Template default |
|---|---|---|---|---|
| `lead_D1` | D+1 | 12 | 36 | "Ola {patient_name}, tudo bem? Posso te ajudar a concluir seu agendamento com {professional_name}?" |
| `lead_D2` | D+2 | 36 | 60 | "Oi {patient_name}, sigo por aqui para ajudar no agendamento..." |
| `lead_D3` | D+3 | 60 | 84 | "Ola {patient_name}, passando para te lembrar..." |
| `lead_D5` | D+5 | 108 | 132 | "Oi {patient_name}, ainda quer seguir com o atendimento?" |
| `lead_D7` | D+7 | 156 | 180 | "Ola {patient_name}, este e meu ultimo lembrete..." |

**Cálculo de elegibilidade:**
```typescript
const elapsedHours = (Date.now() - new Date(lastOutgoingAt).getTime()) / (1000 * 60 * 60)
const match = steps.find((step) => elapsedHours >= step.min_hours && elapsedHours < step.max_hours)
```

---

### 2.2. Atendimento Cadence (`atendimento-cadence.ts`)

#### Fluxo similar ao Lead, diferenças:

1. **Query de conversas candidatas:**
   ```sql
   SELECT id, contact_id, stage, last_incoming_at, last_outgoing_at, last_outgoing_by
   FROM conversations
   WHERE client_id = ? AND status != 'resolved' AND last_outgoing_by = 'human'
   LIMIT 500
   ```

   **Filtro adicional:**
   - `last_outgoing_by = 'human'` → apenas conversas onde humano falou por último
   - `last_incoming_at < last_outgoing_at` → lead não respondeu após humano

2. **Mesmo filtro de agendamento** (remove conversas agendadas)

3. **Mesmos skips por stage `in_service`/`awaiting_human`**

#### Steps definidos:

| Step | Label | Min Hours | Max Hours |
|---|---|---|---|
| `atendimento_D1` | D+1 | 12 | 36 |
| `atendimento_D2` | D+2 | 36 | 60 |
| `atendimento_D4` | D+4 | 84 | 108 |
| `atendimento_D7` | D+7 | 156 | 180 |
| `atendimento_D10` | D+10 | 228 | 252 |

---

### 2.3. Agendado Cadence (`agendado-cadence.ts`)

#### Fluxo específico de lembretes:

1. **Validação de horário** (mesmo que Lead/Atendimento)

2. **Query de appointments futuros:**
   ```sql
   SELECT a.*, c.conversation_id, c.stage, c.last_incoming_at
   FROM appointments a
   JOIN conversations c ON c.id = a.conversation_id
   WHERE a.client_id = ? 
     AND a.status = 'scheduled' 
     AND a.start_at > NOW()
     AND a.start_at < NOW() + INTERVAL '3 days'
   ```

3. **Filtros:**
   - Remove conversas suprimidas (`followup_cadence_suppressions` com `cadence_type='agendado'`)
   - Skip se `stage IN ('in_service', 'awaiting_human')`
   - Skip se `contact_id IS NULL`

4. **Cálculo de elegibilidade por horas antes do appointment:**
   ```typescript
   const hoursUntil = (new Date(appointment.start_at).getTime() - Date.now()) / (1000 * 60 * 60)
   const match = steps.find((step) =>
     hoursUntil >= step.min_hours_before && hoursUntil < step.max_hours_before
   )
   ```

#### Steps definidos:

| Step | Label | Min Hours Before | Max Hours Before | Timing |
|---|---|---|---|---|
| `agendado_D-2_12h` | D-2 (12h) | 46 | 50 | ~48h antes (meio-dia de D-2) |
| `agendado_-3h` | -3h | 2.5 | 3.5 | 3h antes |
| `agendado_-5min` | -5min | 0.05 | 0.12 | 5min antes |

---

### 2.4. Função Central de Envio (`shared.ts`)

#### `sendFollowupMessage()`

```typescript
async function sendFollowupMessage({
  clientId,
  conversationId,
  contactId,
  recipient,
  instanceName,
  cadenceType,
  stepKey,
  message,
}: SendFollowupMessageParams): Promise<boolean>
```

**Fluxo:**

1. **Verificação de conexão WhatsApp:**
   ```typescript
   const connected = await isWhatsAppConnected(instanceName)
   if (!connected) {
     logFollowupSkip(cadenceType, 'whatsapp_desconectado', { clientId, conversationId })
     return false
   }
   ```

2. **Idempotência (tenta inserir step):**
   ```sql
   INSERT INTO followup_cadence_steps (conversation_id, cadence_type, step_key, message_sent, sent_at)
   VALUES (?, ?, ?, ?, NOW())
   ON CONFLICT (conversation_id, cadence_type, step_key) DO NOTHING
   ```

   Se `rowCount === 0` → step já foi enviado → return false silenciosamente

3. **Envio via Evolution API:**
   ```typescript
   await sendTextMessage(instanceName, recipient, message)
   ```

4. **Log em `followup_logs`:**
   ```sql
   INSERT INTO followup_logs (client_id, conversation_id, cadence_type, step_key, message, status)
   VALUES (?, ?, ?, ?, ?, 'sent')
   ```

5. **Atualiza `conversations.last_followup_at`:**
   ```sql
   UPDATE conversations SET last_followup_at = NOW() WHERE id = ?
   ```

---

## 3. Resumo dos Pontos de Envio

### 3.1. Por origem

| Origem | Cron | Cadências | Steps por execução |
|---|---|---|---|
| `/api/cron/followup-cadencia` | 1h | Lead + Atendimento | 0-500 |
| `/api/cron/followup-agendado` | 5min | Agendado (lembretes) | 0-100 |

### 3.2. Por cadência

| Cadência | Steps totais | Janela total | Objetivo |
|---|---|---|---|
| Lead | 5 (D1-D7) | 12h - 180h (~7 dias) | Nutrir lead sem agendamento |
| Atendimento | 5 (D1-D10) | 12h - 252h (~10 dias) | Acompanhar pós-atendimento humano |
| Agendado | 3 (D-2, -3h, -5min) | 0.05h - 50h (~2 dias antes) | Lembretes de consulta |

### 3.3. Configuração por cliente

| Config | Tabela | Campo |
|---|---|---|
| Steps dinâmicos | `panel_bot_config` | `lead_followup_steps` (JSONB) |
| Steps dinâmicos | `panel_bot_config` | `atendimento_followup_steps` (JSONB) |
| Steps dinâmicos | `panel_bot_config` | `agendado_followup_steps` (JSONB) |
| Horários comerciais | `panel_bot_config` | `working_hours` (JSONB) |
| Timezone | `panel_bot_config` | `timezone` |
| Enabled flags | `panel_bot_config` | `lead_followup_enabled`, `atendimento_followup_enabled` |

**Fallback:** Se JSONB vazio, usa steps default hardcoded + templates de campos legacy (`lead_followup_msg_d1`, etc.)

---

## 4. Mecanismos de Controle

### 4.1. Idempotência

**Constraint:** `UNIQUE (conversation_id, cadence_type, step_key)` em `followup_cadence_steps`

**Comportamento:** Se step já foi enviado, o INSERT falha silenciosamente (`ON CONFLICT DO NOTHING`) e `sendFollowupMessage()` retorna `false`.

### 4.2. Circuit Breaker

**Classe:** `FollowupCircuitBreaker` (em `shared.ts`)

**Lógica:**
- Abre circuito após **3 falhas consecutivas** de envio para um cliente
- Circuito aberto = pula todas as conversas restantes desse cliente
- Reset: sucesso reinicia contador

**Objetivo:** Evitar tentativas em massa quando Evolution API está offline ou instância desconectada

### 4.3. Supressão Manual

**Tabela:** `followup_cadence_suppressions`

**Colunas:**
- `conversation_id`
- `cadence_type`
- `suppressed_at`
- `released_at` (NULL = ativo)

**Query:** `getSuppressedConversations(clientId, cadenceType)` retorna `Set<string>` de conversation_ids bloqueados

**UI:** Central de Follow-ups tem ação "Cancelar cadência" que insere supressão

---

## 5. Gaps e Observações

### 5.1. Não existe estado consolidado

- Não há tabela `conversation_followup_state` ou similar
- Para saber "qual o próximo envio programado", precisa recalcular tudo (query + lógica de janela)
- Operador não vê "próximo step será enviado em X horas"

### 5.2. Decisões invisíveis

- Skips são logados em console, mas não aparecem em lugar acessível
- Se uma conversa não recebe follow-up, operador não sabe por quê:
  - Foi humano ativo?
  - Foi fora do horário?
  - Foi sem step elegível?
  - Foi conversa agendada?

### 5.3. `last_outgoing_by` não é sempre confiável

- Existe o campo, mas precisa ser setado manualmente em cada ponto de envio
- Se mensagem foi enviada via Desk, precisa setar `last_outgoing_by = 'human'`
- Se mensagem foi enviada via bot, precisa setar `last_outgoing_by = 'ai'`
- Risco: mensagem humana não marcada → conversa entra erroneamente em cadência de lead

### 5.4. Conversas "em limbo"

- Se `stage = 'in_service'` mas operador não interage por 24h, follow-up fica bloqueado indefinidamente
- Sistema não detecta "humano parado"
- Conversa pode morrer silenciosamente

### 5.5. Falta análise de contexto

- Se última mensagem do lead foi uma pergunta, follow-up genérico é inapropriado
- Sistema não distingue "lead perguntou sobre preço" vs. "lead disse ok obrigado"
- Follow-up pode parecer "bot burro"

### 5.6. Falta visibilidade de próximos envios

- Operador não vê no Desk: "follow-up programado para amanhã às 09:00"
- Kanban não mostra badges de follow-up
- Central de Follow-ups mostra histórico, mas não "programados"

---

## 6. Pontos Positivos

### 6.1. Idempotência robusta

- ✅ Constraint de unicidade impede duplicação
- ✅ Cron pode rodar múltiplas vezes sem risco

### 6.2. Circuit breaker

- ✅ Evita tentativas em massa quando infra está offline
- ✅ Protege contra rate limit da Evolution API

### 6.3. Horário comercial

- ✅ Respeita `working_hours` configurado
- ✅ Respeita timezone do cliente

### 6.4. Configurabilidade

- ✅ Steps dinâmicos via JSONB
- ✅ Templates personalizáveis
- ✅ Flags de enable/disable por cadência

### 6.5. Supressão manual

- ✅ Operador pode cancelar cadência
- ✅ Cancelamento é persistente e respeitado

---

## 7. Conclusão

### O que funciona:

- Envios são tecnicamente executados
- Idempotência previne duplicação
- Configuração é flexível

### O que falta:

- **Visibilidade:** ninguém sabe o que vai acontecer
- **Estado:** não há registro do estado atual de follow-up por conversa
- **Eventos:** decisões de skip/envio não aparecem na timeline
- **Retomada:** conversas humanas paradas ficam esquecidas
- **Contexto:** sistema não analisa conteúdo da última mensagem

### Próximo passo:

Criar auditoria de pontos de SKIP para entender todas as regras de bloqueio.

---

**Autor:** CTO ChatSales  
**Revisado por:** —  
**Próxima revisão:** Fase 1 (após implementar estado/eventos)
