# PR: feat/migracao-alteracoes-locais → main

**Repositório:** `brinogaze/painel2`  
**Branch:** `feat/migracao-alteracoes-locais`  
**Commits:** 2 (snapshot + lint fixes)  
**Escopo:** 56 arquivos alterados | +6.884 linhas | -317 linhas  
**Data:** 28/03/2026  

---

## 1. Resumo Executivo

Este PR introduz o **sistema completo de follow-up por cadência**, **stage labels configuráveis**, **prompt injection dinâmico** e **hardening do output schema do agente de IA**. As alterações afetam o pipeline de bot (agent → dispatcher → cadences), a API de configuração, a UI do painel admin e o banco de dados (3 migrations).

---

## 2. Features Implementadas

### 2.1 Sistema de Follow-up por Cadência

Três pipelines independentes de follow-up com templates customizáveis por cliente:

| Cadência | Trigger | Steps | Cron |
|----------|---------|-------|------|
| **Lead** | Bot falou, contato não respondeu | D+1, D+2, D+3, D+5, D+7 | `/api/cron/followup-cadencia` |
| **Atendimento** | Contato falou, bot não reengajou | D+1, D+2, D+4, D+7, D+10 | `/api/cron/followup-cadencia` |
| **Agendado** | Lembrete pré-consulta | D-2 (12h), -3h, -5min | `/api/cron/followup-agendado` |

**Lógica principal:**
- Cada step tem janela de tempo (ex: D+1 = 12–36h após último contato)
- **Idempotência**: tabela `followup_cadence_steps` com `UNIQUE(conversation_id, cadence_type, step_key)` — mesmo step nunca é enviado 2x
- **Business hours**: steps são ignorados fora do horário comercial do cliente
- **Template vars**: `{patient_name}`, `{professional_name}`, `{business_name}`, `{date}`, `{time}`, `{day_of_week}`, `{meet_link}`
- **Rollback**: se envio falha, registro de step é removido para retry no próximo ciclo

**Arquivos:**
- `src/lib/followup/lead-cadence.ts` — Pipeline de leads não-respondidos
- `src/lib/followup/atendimento-cadence.ts` — Pipeline de reengajamento em atendimento
- `src/lib/followup/agendado-cadence.ts` — Pipeline de lembretes de agendamento
- `src/app/api/cron/followup-cadencia/route.ts` — Endpoint cron (lead + atendimento em paralelo)
- `src/app/api/cron/followup-agendado/route.ts` — Endpoint cron (agendado, rodar a cada 5min)

### 2.2 Stage Labels Configuráveis

Etiquetas de etapa por cliente, sincronizadas bidirecionalmente com Chatwoot:

- **Configuração no painel**: slug técnico + nome amigável + cadência de follow-up vinculada
- **Defaults**: `etapa_triagem` (lead), `etapa_qualificacao` (atendimento), `etapa_agendado` (agendado), etc.
- **Sync bi-direcional**:
  - GET `/api/bot-config` → puxa labels do Chatwoot e merge com locais (preserva `followup_cadence` configurada)
  - POST `/api/bot-config` → push labels para Chatwoot via `ensureChatwootLabels()` (idempotente)
- **Runtime**: agent busca labels do Chatwoot (cache 2min TTL) e merge com config local
- **Normalização**: todos os slugs passam por `normalizeStageSlug()` (lowercase, sem acentos, underscores)

**Arquivos:**
- `src/lib/bot/stage-labels.ts` — Utilidades: sanitize, normalize, defaults
- `src/lib/api/chatwoot.ts` — `ensureChatwootLabels()`, `listChatwootStageLabels()`
- `src/components/bot-config/stages-labels-section.tsx` — UI de gerenciamento
- `src/lib/bot/agent.ts` — `mergeRuntimeStageLabels()`, `resolveRuntimeBotConfig()`

### 2.3 Prompt Injection Dinâmico

Quatro campos de guia injetados no system prompt do agente:

| Campo | Propósito |
|-------|-----------|
| `process_flow_guide` | Mapa das etapas reais do atendimento e critérios de avanço |
| `objections_guide` | Objeções comuns e respostas recomendadas |
| `qualification_questions_guide` | Perguntas obrigatórias por etapa |
| `disengagement_policy_guide` | Regras de encerramento e possível reativação |

- Máximo 4.000 chars cada (validado em Zod)
- Injetados condicionalmente no system prompt (só se preenchidos)
- UI em `ai-behavior-section.tsx` com textareas dedicados

**Arquivos:**
- `src/lib/bot/system-prompt.ts` — `buildSystemPrompt()` com injeção condicional
- `src/components/bot-config/ai-behavior-section.tsx` — UI dos campos de guia
- `src/lib/validations/bot-config.ts` — Validação Zod com limite de chars

### 2.4 Output Schema Hardening

Validação robusta do JSON retornado pela OpenAI:

- **Zod schema** com campos: `reply`, `status_next`, `labels_next`, `classification`, `handoff`, `action`
- **`safeParseAgentOutput()`**: deduplica labels, garante exatamente 1 etapa label, infere stage de labels, valida contra `validStageSlugs`
- **Fallback**: em caso de parse failure, retorna defaults seguros (`etapa_triagem`, sem handoff)
- **Normalização**: slugs de labels sanitizados antes de validação

**Arquivos:**
- `src/lib/bot/output-schema.ts` — Schema Zod + safeparse + fallback
- `src/lib/bot/dispatcher.ts` — `detectFollowupCadence()` baseado em labels do output

### 2.5 Dispatcher Aprimorado

- `detectFollowupCadence()`: prioriza mapeamento configurado em `stage_labels`, fallback para heurística de nome
- `normalizeTag()`: normaliza tags de labels para consistência
- Atualiza `followup_cadence` na conversa baseado no output do agente
- Suporte a handoff com condições configuráveis

---

## 3. Migrations SQL

Executadas na ordem (já aplicadas no Supabase):

### 004_followup_cadence.sql
```sql
-- Tabela de idempotência para steps de cadência
CREATE TABLE followup_cadence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  cadence_type text NOT NULL CHECK (IN ('lead','atendimento','agendado')),
  step_key text NOT NULL,
  message_sent text,
  sent_at timestamptz DEFAULT now(),
  UNIQUE (conversation_id, cadence_type, step_key)
);

-- 15 colunas de follow-up no panel_bot_config
ALTER TABLE panel_bot_config ADD COLUMN IF NOT EXISTS
  lead_followup_enabled, lead_followup_msg_d1..d7,
  atendimento_followup_enabled, atendimento_followup_msg_d1..d10,
  agendado_followup_msg_d2, minus3h, minus5min;
```

### 005_panel_stage_labels.sql
```sql
ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS stage_labels jsonb DEFAULT '[{"slug":"etapa_triagem","display_name":"Triagem"}]';
```

### 006_panel_prompt_guides.sql
```sql
ALTER TABLE panel_bot_config ADD COLUMN IF NOT EXISTS
  process_flow_guide text,
  objections_guide text,
  qualification_questions_guide text,
  disengagement_policy_guide text;
```

---

## 4. Alterações por Camada

### Backend (API Routes)

| Arquivo | Alteração |
|---------|-----------|
| `api/bot-config/route.ts` | GET com Chatwoot pull-sync + POST com upsert, push-sync, auditoria |
| `api/cron/followup-cadencia/route.ts` | **Novo** — Lead + Atendimento pipelines |
| `api/cron/followup-agendado/route.ts` | **Novo** — Agendado pipeline |
| `api/cron/confirmacoes/route.ts` | Desativado (legacy, evita concorrência) |
| `api/whatsapp/instances/route.ts` | `ensureChatwootLabels()` na criação de instância |

### Bot Engine

| Arquivo | Alteração |
|---------|-----------|
| `lib/bot/agent.ts` | Runtime stage labels merge, cache TTL 2min, AI pause 10min |
| `lib/bot/dispatcher.ts` | `detectFollowupCadence()`, normalizeTag, cadence update |
| `lib/bot/system-prompt.ts` | Injeção de guides, stage labels, contexto de conversa |
| `lib/bot/output-schema.ts` | Zod schema, safeparse com validação de slugs |
| `lib/bot/pipeline.ts` | Ajustes de integração |
| `lib/bot/stage-labels.ts` | **Novo** — Sanitize, normalize, defaults |

### Follow-up Cadences

| Arquivo | Alteração |
|---------|-----------|
| `lib/followup/lead-cadence.ts` | **Novo** — Pipeline completo lead |
| `lib/followup/atendimento-cadence.ts` | **Novo** — Pipeline completo atendimento |
| `lib/followup/agendado-cadence.ts` | **Novo** — Pipeline completo agendado |

### UI (Componentes)

| Arquivo | Alteração |
|---------|-----------|
| `components/bot-config/stages-labels-section.tsx` | **Novo** — CRUD de stage labels |
| `components/bot-config/followup-section.tsx` | Expandido com 3 abas (Lead/Atendimento/Agendado) |
| `components/bot-config/ai-behavior-section.tsx` | **Novo** — Campos de prompt guides |
| `components/client-detail/edit-client-form.tsx` | Integração do StagesLabelsSection |
| `components/onboarding/steps/bot-config.tsx` | Integração dos novos campos |

### Chatwoot API

| Arquivo | Alteração |
|---------|-----------|
| `lib/api/chatwoot.ts` | `ensureChatwootLabels()`, `listChatwootStageLabels()`, `createAccountLabel()` |

### Tipos e Validação

| Arquivo | Alteração |
|---------|-----------|
| `types/database.ts` | `StageLabelConfig`, campos de guide/followup em `PanelBotConfig` |
| `lib/validations/bot-config.ts` | **Novo** — Zod schemas com regras de validação |

### Lint Fixes (commit 2)
- ESLint: ignore `scripts/` (Node.js standalone)
- Remove imports não usados em 5 arquivos
- Refactor effects em `soc-content.tsx` (inner async)
- Suppress `no-img-element` para QR codes base64
- Fix `Date.now()` purity em server component

---

## 5. Testes a Realizar

### 5.1 Testes Críticos (P0 — bloqueia deploy)

#### Bot Config API
- [ ] **GET /api/bot-config?client_id=X** → Retorna config com stage_labels populadas
- [ ] **POST /api/bot-config** com `professional_name`, `working_hours`, `stage_labels[]` → Upsert OK + labels aparecem no Chatwoot
- [ ] **POST sem campos obrigatórios** → Retorna 400 com mensagem de validação
- [ ] **POST com stage_labels duplicados** → Deduplica slugs automaticamente

#### Follow-up Cadência (Lead)
- [ ] Criar conversa onde bot enviou última mensagem > 12h atrás
- [ ] Chamar `POST /api/cron/followup-cadencia` com header `x-cron-secret`
- [ ] Verificar que mensagem D+1 foi enviada via WhatsApp
- [ ] Chamar de novo → **não deve enviar novamente** (idempotência)
- [ ] Verificar que `followup_cadence_steps` tem registro com `cadence_type='lead'`, `step_key='d1'`

#### Follow-up Cadência (Atendimento)
- [ ] Conversa onde contato enviou última mensagem > 12h, stage = atendimento/qualificação
- [ ] Chamar cron → Mensagem D+1 de reengajamento enviada
- [ ] Testar com stage não-atendimento → **não deve enviar**

#### Follow-up Agendado
- [ ] Criar agendamento para daqui ~48h
- [ ] Chamar `POST /api/cron/followup-agendado`
- [ ] Verificar lembrete D-2 enviado com variáveis preenchidas (data, hora, dia da semana)
- [ ] Criar agendamento para daqui ~3h → Verificar lembrete -3h
- [ ] Testar idempotência (chamar 2x → 1 mensagem)

#### Agent Output Schema
- [ ] Enviar mensagem ao bot → Verificar que resposta tem `labels_next` com pelo menos 1 etapa válida
- [ ] Verificar logs: `safeParseAgentOutput` não lançou erros
- [ ] Testar com output malformado (simular) → Fallback `etapa_triagem` aplicado

### 5.2 Testes Importantes (P1)

#### Stage Labels UI
- [ ] Abrir config de cliente → Seção "Etapas/Etiquetas" visível
- [ ] Adicionar nova etapa → Slug normalizado (sem acentos, lowercase)
- [ ] Vincular cadência a etapa → Salvar → Reabrir → Valor preservado
- [ ] Remover etapa (mínimo 1 deve permanecer)
- [ ] Botão "Sincronizar do Chatwoot" → Puxa labels remotas

#### Prompt Guides UI
- [ ] Abrir config → Campos de guia (processo, objeções, qualificação, desengajamento)
- [ ] Preencher campo > 4000 chars → Validação impede save
- [ ] Salvar guias → Enviar mensagem ao bot → Verificar que prompt contém os guias

#### Follow-up Templates UI
- [ ] Aba Lead: toggle habilita/desabilita, templates editáveis
- [ ] Aba Atendimento: idem
- [ ] Aba Agendado: templates com variáveis de agendamento
- [ ] Salvar templates customizadas → Cron usa a customizada (não default)

#### Chatwoot Sync
- [ ] Criar instância WhatsApp → Labels default criadas no Chatwoot
- [ ] Alterar labels no painel → Labels criadas no Chatwoot (idempotente)
- [ ] Verificar que labels pré-existentes no Chatwoot não são duplicadas

### 5.3 Testes de Regressão (P2)

- [ ] Login e navegação do painel funcionam normalmente
- [ ] Kanban board carrega deals sem erro
- [ ] SOC (Security Operations) → Logs e health checks carregam
- [ ] Criar novo cliente (onboarding completo) → Todos os steps funcionam
- [ ] QR Code de WhatsApp exibe corretamente (connect page)
- [ ] Editar cliente existente → Campos antigos preservados
- [ ] Cron de confirmações (legacy) → Responde 200 com mensagem de desativado
- [ ] Calendar agent → Agendamento cria/atualiza evento OK

### 5.4 Testes de Edge Case

- [ ] Cliente sem `working_hours` configurado → Cadência opera 24h
- [ ] Cliente com `lead_followup_enabled = false` → Lead pipeline ignora
- [ ] Conversa já resolvida → Nenhuma cadência dispara
- [ ] Template com variável inválida (ex: `{xyz}`) → Renderiza como `{xyz}` literal
- [ ] Chatwoot API indisponível → Bot continua funcionando (fallback graceful)
- [ ] Múltiplas execuções do cron em paralelo → Sem mensagens duplicadas (idempotência DB)

---

## 6. Variáveis de Ambiente Necessárias

Já configuradas no Easypanel (nenhuma nova):
- `OPENAI_API_KEY` — Chat completions
- `EVOLUTION_API_KEY` — Envio WhatsApp
- `CHATWOOT_API_TOKEN` / `CHATWOOT_PLATFORM_TOKEN` — Sync labels
- `SUPABASE_SERVICE_ROLE_KEY` — Admin queries
- `CRON_SECRET` — Proteção dos endpoints cron

**Nova config de scheduler necessária:**
- `/api/cron/followup-cadencia` → Rodar a cada **30 minutos**
- `/api/cron/followup-agendado` → Rodar a cada **5 minutos**

---

## 7. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Mensagens duplicadas | Constraint UNIQUE no DB + verificação antes do insert |
| Chatwoot API rate limit | Cache TTL 2min no agent, sync não-bloqueante |
| OpenAI output malformado | safeParseAgentOutput com fallback seguro |
| Cron execução longa | Timeout configurável, logs de progresso |
| Stage labels inconsistentes | Normalização centralizada + merge bidirecional |

---

## 8. Documentação Adicional Incluída

- `COMECE_AQUI.md` — Guia de início rápido do projeto
- `QUICK_REFERENCE.md` — Referência rápida de arquitetura
- `fup_logicv2.md` — Lógica detalhada do follow-up v2
- `labels_panelconfigv1.md` — Especificação de stage labels
- `STATUS_CLASSIFICATION.md` — Classificação de status do bot
- `.github/agents/` — 5 GitHub Copilot agents especializados
- `.github/copilot-instructions.md` — Instruções globais para Copilot
