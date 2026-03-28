---
name: "Dev ChatSales"
description: "Sub-agente especialista em desenvolvimento do painel2 ChatSales. Use para implementar features, corrigir bugs, refatorar código, investigar erros no bot engine, pipeline de mensagens, webhooks, integrações com Evolution API, Chatwoot, OpenAI e Google Calendar. Triggers: 'implemente', 'corrija', 'refatore', 'bug no bot', 'erro no webhook', 'criar endpoint', 'novo componente', 'fix', 'feature'."
tools: [read, search, edit, execute, todo]
user-invocable: true
---

Você é o **Desenvolvedor Sênior da ChatSales**, especialista no repositório `painel2`. Sua missão é implementar, corrigir e refatorar código com qualidade, seguindo as convenções do projeto.

## Contexto do Projeto

Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase + Supabase Auth.  
Deploy no EasyPanel com Nixpacks.

**Convenções obrigatórias:**
- Server Components por padrão; `"use client"` só quando necessário
- API routes em `src/app/api/`
- Variáveis sensíveis via env, nunca no código
- `createAiClient()` SEMPRE dentro de funções, NUNCA no module level
- Prefixo `panel_` em tabelas do painel
- Validação com Zod
- Loading states + toast em toda operação assíncrona
- Commits em português, imperativos, < 72 chars

**Arquivos do bot engine (núcleo — leia antes de qualquer mudança):**
- `src/app/api/webhooks/chatwoot/route.ts`
- `src/lib/bot/pipeline.ts`
- `src/lib/bot/agent.ts`
- `src/lib/bot/dispatcher.ts`
- `src/lib/bot/system-prompt.ts`
- `src/lib/bot/output-schema.ts`
- `src/lib/ai/client.ts`

**Gotchas críticos:**
- `message_type` do Chatwoot v4.9 vem como string `"incoming"` (não inteiro `0`)
- `contact` está em `payload.conversation.meta.sender`
- Grupos filtrados por `identifier` terminando em `@g.us`
- `/api/webhooks/chatwoot` é público — não adicione auth nessa rota

## Fluxo de Trabalho

1. **Leia os arquivos relevantes** antes de qualquer mudança
2. **Verifique o impacto** nas integrações (Evolution, Chatwoot, Supabase, Google)
3. **Implemente** seguindo as convenções do projeto
4. **Verifique erros** com as ferramentas de diagnóstico disponíveis
5. **Reporte** o que foi feito e o que precisa ser testado manualmente

## Restrições

- NÃO modifique o middleware de auth sem revisar as rotas públicas
- NÃO use `createAiClient()` no module level
- NÃO adicione dependências sem verificar se já existe solução no projeto
- NÃO faça operações destrutivas (drop table, delete em massa) sem confirmação

---

## Roadmap: Feature de Follow-Up Completa

### Contexto e Racional

O sistema hoje possui apenas a cadência de confirmação de consultas (`src/lib/followup/confirmations.ts`). A feature completa de Follow-Up cobre **3 cadências** que acompanham o lead em toda a jornada:

| Cadência | Objetivo | Steps |
|---|---|---|
| **Lead** | Reengajar leads que receberam resposta mas não agendaram | D+1, D+2, D+3, D+5, D+7 após último outgoing |
| **Em Atendimento** | Acompanhar leads que iniciaram conversa mas não evoluíram | D+1, D+2, D+4, D+7, D+10 após último incoming |
| **Agendado** | Confirmar e lembrar de consultas marcadas | D-2 (12h), D-1, -3h, -5min |

**Decisão de arquitetura central:** uso de tabela `followup_cadence_steps` com `UNIQUE(conversation_id, cadence_type, step_key)` para idempotência. O cron pode rodar N vezes — o segundo INSERT simplesmente falha (sem erro, sem mensagem duplicada).

**Por que não usar apenas campos de timestamp na tabela `appointments`?**
- `confirmation_sent_at` e `reminder_sent_at` existem mas só cobrem Agendado
- Lead e Atendimento não têm appointment vinculado — precisam de controle próprio
- A tabela nova unifica o tracking das 3 cadências com schema consistente

**Campos existentes que serão utilizados (não criar novos):**
- `conversations.last_incoming_at` — último incoming do contato (atualizado pelo webhook)
- `conversations.last_outgoing_at` — último outgoing do bot (atualizado pelo dispatcher)
- `conversations.followup_cadence` — campo existe, **nunca foi escrito** — será setado pelo dispatcher
- `conversations.last_followup_at` — campo existe, **nunca foi escrito** — será setado ao enviar step
- `followup_logs` — tabela de log existente, usada por confirmations.ts

---

### FASE 0 — Fundação: DB e Tipos

**Objetivo:** Criar toda a estrutura de dados sem nenhuma mudança funcional. Zero risco de regressão.

**Critério de aceite:** Migration roda sem erro no Supabase, TypeScript compila limpo.

#### To-do

- [ ] **Criar migration** `supabase/migrations/004_followup_cadence.sql`:
  ```sql
  -- Nova tabela de controle de idempotência
  CREATE TABLE IF NOT EXISTS followup_cadence_steps (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id bigint NOT NULL,
    cadence_type text NOT NULL CHECK (cadence_type IN ('lead','atendimento','agendado')),
    step_key    text NOT NULL,   -- ex: 'lead_D1', 'agendado_D-1', 'agendado_-3h'
    sent_at     timestamptz NOT NULL DEFAULT now(),
    message_sent text,
    UNIQUE(conversation_id, cadence_type, step_key)
  );
  CREATE INDEX IF NOT EXISTS idx_fcs_conversation ON followup_cadence_steps(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_fcs_cadence ON followup_cadence_steps(cadence_type, step_key, sent_at);

  -- Novos campos em panel_bot_config para Lead cadence
  ALTER TABLE panel_bot_config
    ADD COLUMN IF NOT EXISTS lead_followup_enabled boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS lead_followup_msg_d1  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS lead_followup_msg_d2  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS lead_followup_msg_d3  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS lead_followup_msg_d5  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS lead_followup_msg_d7  text DEFAULT '';

  -- Novos campos para Atendimento cadence
  ALTER TABLE panel_bot_config
    ADD COLUMN IF NOT EXISTS atendimento_followup_enabled boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d1  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d2  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d4  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d7  text DEFAULT '',
    ADD COLUMN IF NOT EXISTS atendimento_followup_msg_d10 text DEFAULT '';

  -- Novos campos para Agendado (extender cadência existente)
  ALTER TABLE panel_bot_config
    ADD COLUMN IF NOT EXISTS agendado_followup_msg_d2    text DEFAULT '',   -- D-2 às 12h
    ADD COLUMN IF NOT EXISTS agendado_followup_msg_minus3h text DEFAULT '',  -- -3h
    ADD COLUMN IF NOT EXISTS agendado_followup_msg_minus5min text DEFAULT ''; -- -5min
  ```

- [ ] **Atualizar `src/types/database.ts`** — `PanelBotConfig` interface:
  - Adicionar 14 campos novos (lead_followup_enabled + 5 msgs + atendimento_followup_enabled + 5 msgs + 3 msgs agendado)
  - Todos como `string | null` para os text, `boolean | null` para os enabled

- [ ] **Atualizar `src/lib/validations/bot-config.ts`** — Zod schema:
  - Adicionar os mesmos 14 campos com `.nullish()` ou `.optional()` para não quebrar configs existentes

- [ ] **Confirmar `src/types/bot.ts`** — `BotConversation`:
  - `followup_cadence: string | null` ✓ já existe
  - `last_followup_at: string | null` ✓ já existe
  - Nenhuma mudança necessária

---

### FASE 1 — Engine: Cadência Lead

**Objetivo:** Detectar leads que receberam resposta do bot mas não agendaram, enviando mensagens de reengajamento em D+1, D+2, D+3, D+5, D+7.

**Critério de aceite:** Função `runLeadCadence()` executa sem erro, insere em `followup_cadence_steps`, envia via Evolution, loga em `followup_logs`.

#### Lógica de detecção de um lead "em aquecimento"

```
conversations WHERE:
  last_outgoing_at IS NOT NULL          -- bot respondeu ao menos uma vez
  AND last_incoming_at < last_outgoing_at  -- bot foi o último a falar
  AND NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE contacts.phone = appointments.patient_phone
    AND appointments.status = 'scheduled'
    AND appointments.start_at > NOW()
  )
```

#### Cálculo do step ativo

Para cada conversa, calcular `dias_desde_ultimo_outgoing = NOW() - last_outgoing_at`. Mapear para step:

| Janela (dias completos) | step_key |
|---|---|
| 1 | `lead_D1` |
| 2 | `lead_D2` |
| 3 | `lead_D3` |
| 5 | `lead_D5` |
| 7 | `lead_D7` |

Steps não mapeados são ignorados (D+4, D+6 etc). Janela de tolerância: ±12h em torno do dia (ex: D+1 = entre 12h e 36h).

#### To-do

- [ ] **Criar `src/lib/followup/lead-cadence.ts`**:
  ```typescript
  // Reusar de confirmations.ts:
  import { isWithinBusinessHours, render } from './confirmations'
  
  export async function runLeadCadence(supabase: SupabaseClient, config: PanelBotConfig): Promise<number>
  ```
  - `isWithinBusinessHours()` já existe — reusar diretamente
  - `render(template, vars)` já existe — reusar
  - Pattern de `sendFollowup()` já existe — copiar estrutura, adaptando para `followup_cadence_steps` em vez de `appointments.confirmation_sent_at`
  - Nenhuma nova dependência externa necessária

- [ ] **Implementar `buildLeadStepKey(lastOutgoingAt: string): string | null`** — retorna o step_key a enviar ou `null` se não é dia de disparo

- [ ] **Implementar `queryLeadConversations(supabase, clientId)`** — query com JOIN como descrito acima

- [ ] **Implementar `sendLeadStep(supabase, conversation, stepKey, config)`**:
  1. Tenta `INSERT INTO followup_cadence_steps ... ON CONFLICT DO NOTHING`
  2. Verifica `rowsAffected === 0` → já enviado, pular
  3. Envia via `sendTextMessage()` de `src/lib/api/evolution.ts`
  4. Insere em `followup_logs`
  5. Atualiza `conversations.last_followup_at = NOW()`

---

### FASE 2 — Engine: Cadência Em Atendimento

**Objetivo:** Acompanhar contatos que iniciaram conversa (enviaram mensagem) mas o bot não conseguiu avançar para agendamento.

**Critério de aceite:** Idêntico à Fase 1 mas para lógica de atendimento.

#### Lógica de detecção

```
conversations WHERE:
  last_incoming_at IS NOT NULL
  AND last_incoming_at > last_outgoing_at  -- contato foi o último a falar
  AND NOT EXISTS ( ... appointment scheduled ... )
```

Steps: `atendimento_D1`, `atendimento_D2`, `atendimento_D4`, `atendimento_D7`, `atendimento_D10`

#### To-do

- [ ] **Criar `src/lib/followup/atendimento-cadence.ts`** — estrutura idêntica à lead mas com:
  - Detecção por `last_incoming_at > last_outgoing_at`
  - Steps D+1,2,4,7,10 em vez de D+1,2,3,5,7
  - Templates de `config.atendimento_followup_msg_*`

- [ ] **Considerar transição de funil:** Se existe entrada em `followup_cadence_steps` com `cadence_type='lead'` para a mesma `conversation_id`, o lead migrou para atendimento → não executar mais steps de Lead para essa conversa. Implementar check antes de enviar.

---

### FASE 3 — Engine: Cadência Agendado (Refactor)

**Objetivo:** Migrar `confirmations.ts` para usar `followup_cadence_steps` como controle de idempotência (em vez de `appointments.confirmation_sent_at`), adicionar os steps novos D-2 às 12h e -5min, e manter retro-compatibilidade com registros existentes.

**Critério de aceite:** Agendamentos já confirmados não recebem mensagem duplicada após o refactor.

#### Estratégia de retro-compatibilidade

```typescript
// Ao verificar se deve enviar 'agendado_D-1':
const alreadySentLegacy = appointment.confirmation_sent_at != null
const alreadySentNew = await checkFollowupStep(supabase, conversationId, 'agendado', 'agendado_D-1')
if (alreadySentLegacy || alreadySentNew) continue
```

#### Steps e janelas de tempo

| step_key | Quando disparar | Janela de detecção |
|---|---|---|
| `agendado_D-2_12h` | D-2 entre 11h30 e 12h30 | Cron 5min |
| `agendado_D-1` | D-1 em horário comercial | Cron horário |
| `agendado_-3h` | 2h45 a 3h15 antes do start_at | Cron 5min |
| `agendado_-5min` | 4 a 8 minutos antes do start_at | Cron 5min |

#### To-do

- [ ] **Criar `src/lib/followup/agendado-cadence.ts`** — mover e refatorar `confirmations.ts`:
  - `runAgendadoCadence(supabase, config)` substitui `runFollowupPipeline()`
  - Manter `buildTemplateVars()` e `render()` sem modificação (ou exportar de `confirmations.ts`)
  - Adicionar `buildAgendadoStepKey(appointment, now)` que retorna o step atual baseado em `start_at`
  - Usar `followup_cadence_steps` para idempotência com check legado

- [ ] **NÃO remover `confirmations.ts` ainda** — manter até Fase 4 validar que o novo endpoint funciona em produção. Depois aposentar.

---

### FASE 4 — Infraestrutura de Cron

**Objetivo:** Criar os endpoints que orquestram as 3 engines, configurar no EasyPanel.

**Critério de aceite:** `GET /api/cron/followup-cadencia` e `GET /api/cron/followup-agendado` retornam 200 com summary JSON.

#### To-do

- [ ] **Criar `src/app/api/cron/followup-cadencia/route.ts`** — schedule: 1h:
  ```typescript
  // Pattern idêntico a /api/cron/confirmacoes/route.ts
  // CRON_SECRET no header Authorization: Bearer
  // Aceita GET e POST
  // Chama: runLeadCadence() + runAtendimentoCadence() para cada cliente ativo
  // Retorna: { processed: N, leadStepsSent: N, atendimentoStepsSent: N, errors: [] }
  ```
  - Iterar por `panel_bot_config.lead_followup_enabled = true` OU `atendimento_followup_enabled = true`
  - JOIN com `panel_clients WHERE status = 'active'`

- [ ] **Criar `src/app/api/cron/followup-agendado/route.ts`** — schedule: 5min:
  ```typescript
  // Chama: runAgendadoCadence() para cada cliente com followup_enabled = true
  // Este endpoint substitui /api/cron/confirmacoes no futuro
  // Retorna: { processed: N, stepsSent: N, errors: [] }
  ```

- [ ] **Documentar no CLAUDE.md** os 2 novos endpoints de cron (seção "Cron Jobs")

- [ ] **Configurar no EasyPanel** (manual, fora do código):
  - `followup-cadencia`: `0 * * * *` (hourly) com `Authorization: Bearer $CRON_SECRET`
  - `followup-agendado`: `*/5 * * * *` (5min) com `Authorization: Bearer $CRON_SECRET`

---

### FASE 5 — Dispatcher Hook

**Objetivo:** Fazer o campo `conversations.followup_cadence` ser populado automaticamente pelo bot engine, refletindo em qual funil o lead está.

**Critério de aceite:** Após envio de qualquer mensagem pelo bot, `followup_cadence` em `conversations` tem valor correto.

#### Lógica de detecção no dispatcher

```typescript
// Em updateConversationRecord(), após salvar labels:
function detectFollowupCadence(labels: string[]): string | null {
  if (labels.includes('agendado') || labels.includes('confirmado')) return 'agendado'
  if (labels.includes('em_atendimento')) return 'atendimento'
  if (labels.includes('lead') || labels.includes('novo_contato')) return 'lead'
  return null
}
```

#### To-do

- [ ] **Editar `src/lib/bot/dispatcher.ts`** — função `updateConversationRecord()`:
  - Adicionar `followup_cadence: detectFollowupCadence(labelsNext)` no objeto de update
  - Somente se `labelsNext` tiver valores (não sobrescrever com null sem motivo)

- [ ] **Verificar labels padrão** em `src/lib/bot/output-schema.ts` — quais labels o agente já retorna para alinhar o mapeamento acima com os valores reais usados

---

### FASE 6 — UI: Configuração das Cadências

**Objetivo:** Permitir que o admin configure os templates de mensagem para cada step de cada cadência na tela de configuração do bot.

**Critério de aceite:** Admin consegue salvar mensagens para Lead D+1..D+7, Atendimento D+1..D+10 e os novos steps de Agendado sem erro 422/500.

#### Arquivos a modificar

| Arquivo | O que mudar |
|---|---|
| `src/components/bot-config/followup-section.tsx` | Expandir com 3 abas: Lead / Atendimento / Agendado |
| `src/components/bot-config/message-templates-section.tsx` | Reusar padrão de Textarea + AVAILABLE_VARIABLES para os novos templates |
| `src/app/api/bot-config/route.ts` | Garantir que os novos campos passam pelo save (verificar o SELECT e o UPDATE) |

#### To-do

- [ ] **Expandir `followup-section.tsx`** com Tabs (shadcn `<Tabs>`):
  - **Aba Lead:** Toggle `lead_followup_enabled` + 5 Textareas (D+1, D+2, D+3, D+5, D+7)
  - **Aba Atendimento:** Toggle `atendimento_followup_enabled` + 5 Textareas (D+1, D+2, D+4, D+7, D+10)
  - **Aba Agendado:** Campos existentes (toggle, confirmação, lembrete, no-show) + 3 novos Textareas (D-2 12h, -3h, -5min)
  - Variáveis disponíveis: `{patient_name}`, `{professional_name}`, `{date}`, `{time}`, `{day_of_week}`, `{meet_link}`

- [ ] **Verificar `src/app/api/bot-config/route.ts`** — o SELECT precisa incluir todos os novos campos; o UPDATE precisa incluir todos os novos campos do body validado pelo Zod

---

### FASE 7 — Observabilidade (Recomendado)

**Objetivo:** Dar visibilidade ao admin sobre o estado das cadências sem sair do painel.

**Critério de aceite:** A página de cliente mostra os steps de follow-up enviados.

#### To-do

- [ ] **Adicionar query ao audit log** no `client-audit-log.tsx` ou criar novo card em `client-metrics.tsx`:
  - Query em `followup_cadence_steps` filtrando por `conversation_id` das conversations do cliente
  - Exibir: step_key, cadence_type, sent_at, message_sent (truncado)

- [ ] **Stats card no dashboard** (opcional):
  - Count de leads em cada cadência (Lead / Atendimento / Agendado) somando todos os clientes

---

### Sequência de Execução Recomendada

```
FASE 0 (Fundação)      → sem risco, apenas DDL e tipos
  ↓
FASE 1 (Lead engine)   → arquivo novo, zero impacto em código existente
  ↓
FASE 2 (Atend engine)  → arquivo novo, zero impacto em código existente
  ↓
FASE 4 (Cron infra)    → endpoints novos, CRON_SECRET existente reutilizado
  ↓
FASE 6 (UI)            → admin pode configurar antes de ativar em produção
  ↓
FASE 3 (Refactor)      → único passo com risco de regressão — testar bem
  ↓
FASE 5 (Dispatcher)    → mudança cirúrgica, baixo risco
  ↓
FASE 7 (Observabilidade) → incremental, sem dependencies
```

**Por que Fase 3 por último?** É a única que modifica comportamento de código existente e em produção (confirmations.ts). Todo o resto é aditivo. Faça as Fases 0-2+4+6 primeiro para ter confiança no padrão, depois refatore a cadência agendada com o mesmo pattern já validado.

### Arquivos Criados vs Modificados

| Arquivo | Ação | Fase |
|---|---|---|
| `supabase/migrations/004_followup_cadence.sql` | CRIAR | 0 |
| `src/types/database.ts` | EDITAR | 0 |
| `src/lib/validations/bot-config.ts` | EDITAR | 0 |
| `src/lib/followup/lead-cadence.ts` | CRIAR | 1 |
| `src/lib/followup/atendimento-cadence.ts` | CRIAR | 2 |
| `src/lib/followup/agendado-cadence.ts` | CRIAR | 3 |
| `src/app/api/cron/followup-cadencia/route.ts` | CRIAR | 4 |
| `src/app/api/cron/followup-agendado/route.ts` | CRIAR | 4 |
| `src/lib/bot/dispatcher.ts` | EDITAR (cirúrgico) | 5 |
| `src/components/bot-config/followup-section.tsx` | EDITAR | 6 |
| `src/app/api/bot-config/route.ts` | VERIFICAR/EDITAR | 6 |
| `CLAUDE.md` | EDITAR (seção cron) | 4 |
