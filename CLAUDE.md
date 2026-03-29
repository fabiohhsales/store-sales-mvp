# CLAUDE.md — Painel Admin Multi-Tenant (Sales Tec)

## Visão geral

Painel administrativo para escalar o onboarding de clientes do sistema de chatbot
de agendamento da Sales Tec. Cada cliente é um profissional/clínica que contrata
o serviço da Sales Tec.

O mercado-alvo são profissionais de saúde (médicos, dentistas, psicólogos, fisioterapeutas)
e negócios de serviços que agendam por WhatsApp.

**O bot engine foi migrado do n8n para código nativo Next.js.**
**O pipeline de mensagens foi migrado do Chatwoot para direto na Evolution API.**
n8n e Chatwoot ainda existem na infra mas NÃO SÃO MAIS usados para processar mensagens.

---

## Arquitetura atual (pós-migração Evolution direta)

```
Paciente (WhatsApp)
  ↓ mensagem
Evolution API v2.3.7 (Baileys)
  ↓ webhook direto (sem Chatwoot)
POST /api/webhooks/evolution (no painel Next.js)
Bot Engine (src/lib/bot/) — pipeline nativo Next.js
  ↓ identifica cliente pelo evolution_instance_name
  ↓ upsert contact/conversation/message no Supabase (com client_id)
  ↓ AI Agent (OpenAI gpt-4o-mini) com system prompt dinâmico
  ↓ dispatch: envia resposta via Evolution API
Evolution API → WhatsApp (resposta ao paciente)

Supabase (PostgreSQL) — banco central
Google Calendar — conta central Sales Tec (GOOGLE_REFRESH_TOKEN), calendários por cliente
```

### Identificação do cliente (novo fluxo)

Identificação: `payload.instance` (Evolution instance name) → busca em `panel_whatsapp_config.evolution_instance_name`.

**NÃO usa mais `chatwoot_account_id`.**

### Desk — Painel de Atendimento Humano

Operadores podem ver o fluxo do bot em tempo real e assumir conversas para responder
como o número WhatsApp do cliente.

- Rota: `/desk?client_id=<uuid>` (admins) ou `/desk` (operators via panel_users)
- Botão de acesso direto na página do cliente admin: `/clients/[id]`
- Realtime via Supabase (canal `desk:{clientId}` e `chat:{conversationId}`)

---

## Bot Engine (src/lib/bot/)

### Fluxo de uma mensagem (Evolution direto)

```
POST /api/webhooks/evolution
  → normalizeEvolutionPayload()  — filtra fromMe, grupos (@g.us), sem conteúdo
  → void runPipeline()           — responde 200 imediatamente, processa em background
      → runEvolutionPipeline()   — resolve cliente por instance_name, upsert contact/conversation/message
      → runAgent()               — verifica ai_pause, chama OpenAI, retorna AgentOutput
      → dispatch()               — envia WhatsApp via Evolution, atualiza stage/summary, limpa ai_pause
```

### Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `src/app/api/webhooks/evolution/route.ts` | Endpoint POST Evolution — pipeline principal |
| `src/app/api/webhooks/chatwoot/route.ts` | Legado — mantido mas não é mais o pipeline ativo |
| `src/lib/bot/normalize-evolution.ts` | Normaliza payload bruto Evolution para struct interna |
| `src/lib/bot/pipeline.ts` | `runEvolutionPipeline()` — resolve cliente, upsert contact/conversation/message |
| `src/lib/bot/agent.ts` | Verifica ai_pause, chama OpenAI com structured output |
| `src/lib/bot/dispatcher.ts` | Envia resposta WhatsApp, handoff, summary de triagem, limpa ai_pause |
| `src/lib/bot/system-prompt.ts` | Monta system prompt dinâmico a partir do panel_bot_config |
| `src/lib/bot/output-schema.ts` | Schema Zod do JSON estruturado retornado pela IA |
| `src/lib/bot/calendar-agent.ts` | Checa disponibilidade e cria eventos no Google Calendar |
| `src/lib/ai/client.ts` | Cliente OpenAI/Groq unificado (usa OPENAI_API_KEY se disponível) |

### Detalhes do webhook Evolution

- Evento principal: `messages.upsert` — mensagens recebidas
- Evento `connection.update` — sincroniza `connection_status` em `panel_whatsapp_config`
- `fromMe: true` ignorado — não processa respostas do próprio bot
- Grupos (`@g.us`) ignorados
- Rota whitelistada no middleware: `isEvolutionWebhook`

### Deduplicação de mensagens

Campo `evolution_message_id` em `messages` com unique partial index.
Se a mensagem já existe (Evolution entrega duplicada), ignora silenciosamente.

### AI Pause

O `ai_pause` é setado quando operador assume a conversa e **limpo ao devolver ao bot ou resolver**.
Tabela: `ai_pauses` com `conversation_id` (PK) e `paused_until`.

### Handoff (bot → humano)

Quando bot detecta handoff necessário (sentimento negativo, urgência, max_turns, keywords):
1. Envia a `ai_handoff_message` via WhatsApp
2. Gera summary de triagem via OpenAI (max 200 tokens)
3. Muda `stage = 'awaiting_human'` e salva `summary` na conversa
4. Desk notifica operadores via Realtime + toast + browser Notification

### Checagem de status do cliente

`pipeline.ts` verifica `panel_clients.status` antes de processar.
Se status ≠ `'active'`, ignora silenciosamente.

### Sistema de IA

- **Cliente**: `src/lib/ai/client.ts` — usa `OPENAI_API_KEY` se setada, senão `GROQ_API_KEY`
- **Modelo padrão**: `gpt-4o-mini` via `OPENAI_MODEL`
- `createAiClient()` deve ser chamado DENTRO das funções, nunca no module level (causa erro no build)

### System Prompt dinâmico

`src/lib/bot/system-prompt.ts` injeta no prompt:
- Nome do profissional, título, negócio
- Serviços com modalidade expandida (`"ambos"` → `"presencial ou teleconsulta (online)"`)
- Horários de atendimento formatados
- Tom de comunicação (formal/professional_friendly/casual/empathetic)
- Idioma (`ai_language` — ex: `"EN"` força respostas em inglês)
- Instruções customizadas do profissional
- Regras de handoff, labels de etapa, formato JSON obrigatório
- **Anti-alucinação**: instrução explícita de usar só dados do prompt
- **Primeiro nome apenas**: usa só o primeiro nome do contato para evitar que
  o modelo confunda empresa do paciente com o negócio do cliente

---

## URLs dos serviços

| Serviço | URL pública |
|---|---|
| Painel Admin | https://panel-testeworkflow.yvssrw.easypanel.host |
| Evolution API | https://chatsales-evolution-api.yvssrw.easypanel.host |
| n8n (legado) | https://chatsales-n8n.yvssrw.easypanel.host |
| Chatwoot (legado) | https://chatsales-chatwoot.yvssrw.easypanel.host |
| Supabase | https://chatsales-supabase.yvssrw.easypanel.host |

---

## Variáveis de ambiente (EasyPanel — serviço testeworkflow)

```env
# Evolution API
EVOLUTION_API_URL=
EVOLUTION_API_KEY=

# Chatwoot (legado — manter para não quebrar rotas existentes)
CHATWOOT_URL=https://chatsales-chatwoot.yvssrw.easypanel.host
NEXT_PUBLIC_CHATWOOT_URL=https://chatsales-chatwoot.yvssrw.easypanel.host
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=
CHATWOOT_PLATFORM_TOKEN=
CHATWOOT_SUPER_ADMIN_EMAIL=
CHATWOOT_BOT_EMAIL_DOMAIN=
CHATWOOT_BOT_PASSWORD=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App URL (sem trailing slash no código, mas EasyPanel pode ter — já tratado)
NEXT_PUBLIC_APP_URL=

# IA — preferir OpenAI para melhor qualidade
OPENAI_API_KEY=              # define OpenAI como provider
OPENAI_MODEL=gpt-4o-mini     # modelo principal
OPENAI_MODEL_MINI=gpt-4o-mini # modelo leve (datas, etc)
# Fallback Groq (se OPENAI_API_KEY não setada)
GROQ_API_KEY=

# Google Calendar — conta central Sales Tec
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=   # refresh token da conta Google central que gerencia todos os calendários

# n8n (legado, não usado pelo bot engine)
N8N_URL=
N8N_API_KEY=
```

### NEXT_PUBLIC_* e build time

Variáveis `NEXT_PUBLIC_*` precisam estar disponíveis no **build**, não só no runtime.
O `nixpacks.toml` injeta essas vars na fase de build.

---

## Tabelas Supabase

### Tabelas do bot (migradas para Evolution direto — migration 010)

#### ai_pauses
- conversation_id (text, PK)
- paused_until (timestamptz)
- paused_reason (text)
- paused_by (text)
- updated_at (timestamptz)

#### appointments
- id (uuid, PK)
- conversation_id (uuid)
- contact_id (uuid)
- google_event_id (text)
- title / modality / status / meet_link (text)
- start_at / end_at / confirmation_sent_at / reminder_sent_at (timestamptz)
- confirmation_response (text)
- created_at / updated_at (timestamptz)

#### contacts
- id (uuid, PK)
- chatwoot_id (bigint, **nullable** desde migration 010)
- name / phone_number / identifier (text)
- **client_id** (uuid, FK → panel_clients) — adicionado em migration 010
- created_at (timestamptz)
- ⚠️ unique key atual: `phone_number + client_id` (Evolution pipeline)

#### conversations
- id (uuid, PK)
- chatwoot_conversation_id (bigint, **nullable**)
- contact_id (uuid)
- **client_id** (uuid, FK → panel_clients) — adicionado em migration 010
- status (text: open/resolved)
- account_id (integer, **nullable**) — legado Chatwoot
- labels (text[])
- **stage** (text) — adicionado em migration 010: `bot_triage` | `awaiting_human` | `in_service` | `resolved`
- **assigned_operator_id** (uuid) — id do operador que assumiu
- **resolved_at** (timestamptz)
- **summary** (text) — resumo de triagem gerado pelo AI
- last_incoming_at / last_outgoing_at (timestamptz)
- last_outgoing_by / appointment_status / followup_cadence (text)
- ⚠️ SEM coluna `updated_at` — não incluir em INSERT/UPDATE ou o Supabase retorna erro silencioso
- ⚠️ Conversas antigas (pré-migration 010) têm `stage = NULL` e `client_id = NULL`
  — o Desk exclui essas ao filtrar por client_id

#### messages
- id (uuid, PK)
- chatwoot_message_id (bigint, **nullable**)
- **evolution_message_id** (text) — adicionado em migration 010, unique partial index
- **client_id** (uuid, FK → panel_clients) — adicionado em migration 010
- conversation_id (uuid)
- content / content_type / sender_type / from_who (text)
- chatwoot_conversation_id / source_id (text, nullable)
- created_at (timestamptz)

#### panel_users — NOVA (migration 010)
- id (uuid, PK = auth.users.id)
- role (text): `admin` | `operator`
- client_id (uuid, nullable FK → panel_clients) — obrigatório para operators
- created_at (timestamptz)

### Tabelas do painel (panel_*)

#### panel_clients
- id (uuid, PK)
- name / owner_name / email / phone (text)
- status (text): `draft` → `pending_whatsapp` → `pending_google` → `configuring` → `active` → `paused` → `disconnected`
- created_at / updated_at (timestamptz)

#### panel_whatsapp_config
- id (uuid, PK)
- client_id (uuid, FK → panel_clients, UNIQUE)
- evolution_instance_name (text, UNIQUE) — **chave de identificação do cliente no webhook Evolution**
- evolution_instance_id / evolution_instance_token (text)
- connection_status (text): open / connecting / disconnected
- connected_phone (text)
- chatwoot_account_id (integer) — legado, não usado no novo pipeline
- chatwoot_inbox_id (integer) — legado
- chatwoot_agent_token (text) — legado
- webhook_url (text)
- connected_at / disconnected_at / created_at / updated_at (timestamptz)

#### panel_google_config
- id (uuid, PK)
- client_id (uuid, FK → panel_clients, UNIQUE)
- google_email (text) — e-mail do profissional (attendee no convite)
- calendar_id (text) — **obrigatório** — ID do calendário exclusivo na conta central Google
- access_token / refresh_token / scopes (não usados — auth via GOOGLE_REFRESH_TOKEN global)
- token_expiry (timestamptz) — não usado

#### panel_bot_config
Config completa do AI Agent por cliente:

**Perfil**: professional_name, professional_title, professional_register, business_name, business_segment, business_address, business_phone

**Serviços**: services (jsonb) — `[{ name, duration_minutes, modality, price, active }]`

**Horários**: working_hours (jsonb) — `{ monday: { enabled, start, end, break_start, break_end }, ... }`
appointment_duration_default / appointment_buffer_minutes / max_advance_booking_days / min_advance_booking_hours (int)
allow_same_day_booking (bool)

**IA**: ai_greeting_message, ai_tone, ai_language, ai_custom_instructions, ai_fallback_message, ai_handoff_message

**Handoff**: handoff_on_negative_sentiment, handoff_on_medical_urgency, handoff_on_unknown_intent,
handoff_max_ai_turns, handoff_keywords (text[])

**Calendar**: calendar_event_title_template, calendar_event_description_template,
calendar_create_meet_link, calendar_send_invite_to_patient, calendar_color_id

**Chatwoot** (legado): chatwoot_auto_resolve_hours, chatwoot_working_hours_enabled, chatwoot_assign_to_agent_id

#### panel_onboarding_sessions
- id (uuid, PK)
- client_id (uuid, FK)
- token (text, UNIQUE) — URL pública pro cliente
- step_completed / whatsapp_connected / google_connected / config_completed
- expires_at (timestamptz)

#### panel_audit_log
- id (uuid, PK)
- admin_email / action (text)
- client_id (uuid, FK)
- details (jsonb)
- created_at (timestamptz)

#### panel_health_checks
- id (uuid, PK)
- client_id (uuid, FK)
- service / status / details (text)
- response_time_ms (int)
- checked_at (timestamptz)

---

## APIs externas

### Evolution API
```
POST   /instance/create                     — cria instância
GET    /instance/connect/{instance}         — gera QR
GET    /instance/connectionState/{instance} — status
GET    /instance/fetchInstances             — lista
DELETE /instance/delete/{instance}          — remove
POST   /chatwoot/set/{instance}             — configura/desabilita integração Chatwoot
POST   /webhook/set/{instance}              — ⚠️ configura webhook (não PUT /instance/webhook/)
POST   /message/sendText/{instance}         — envia mensagem
```
Header: `apikey: EVOLUTION_API_KEY`

⚠️ **Endpoint correto para webhook**: `POST /webhook/set/{instance}` com body `{ webhook: { url, ... } }`
O `PUT /instance/webhook/{instance}` retorna 404 — não usar.

### Google Calendar (conta central)

```
Auth: google.auth.OAuth2 com GOOGLE_REFRESH_TOKEN (src/lib/calendar/client.ts)
Scopes: calendar, calendar.events
```

---

## Rotas da API do painel

### Bot (webhooks)
- `POST /api/webhooks/evolution` — ⭐ pipeline principal (público, sem auth)
- `POST /api/webhooks/chatwoot` — legado (público, sem auth)

### Desk (Painel de Atendimento)
- `GET /api/desk/conversations?client_id=&stage=` — lista conversas (all|bot_triage|awaiting_human|in_service|resolved)
- `GET /api/desk/conversations/[id]?client_id=` — conversa + histórico completo
- `POST /api/desk/conversations/[id]/action` — `{ action: 'assume'|'return'|'resolve' }`
- `POST /api/desk/conversations/[id]/message` — `{ content }` — envia via Evolution + persiste
- `GET /api/desk/stats?client_id=` — contagens por stage

### Clientes
- `GET/POST /api/clients` — lista / cria cliente
- `GET/PATCH/DELETE /api/clients/[id]` — detalhe / atualiza / deleta
- `POST /api/clients/[id]/activate` — ativa cliente
- `DELETE /api/clients/[id]/history` — reseta histórico (messages, conversations, ai_pauses, appointments)

### Auth / OAuth
- `GET /api/auth/callback` — callback Supabase Auth
- `GET /api/auth/google/callback` — callback OAuth Google
- `GET /api/auth/google/public` — OAuth público (onboarding sem login)

### Onboarding público
- `GET /connect/[token]` — página pública de onboarding do cliente

### Health
- `GET /api/health/[service]` — health check de serviço

---

## Middleware de autenticação

`src/lib/supabase/middleware.ts` — protege todas as rotas.

Rotas públicas (sem auth middleware):
- `/api/auth/callback`, `/api/auth/google/*`
- `/api/health/*`
- `/connect/*` (onboarding público)
- rotas com `/public-qr`
- `/api/webhooks/chatwoot` e `/api/webhooks/evolution` ← críticos, devem permanecer públicos
- `/api/desk/*` ← público no middleware, mas autenticado internamente via `resolveDeskUser()`
- `/api/pipeline/*`, `/api/agenda/*`

### resolveDeskUser (src/lib/desk/auth.ts)

Resolve `client_id` para as APIs do Desk:
- **Operators** (`panel_users.role = 'operator'`): `client_id` vem de `panel_users.client_id`
- **Admins** (`panel_users.role = 'admin'`) ou usuários sem `panel_users`: `client_id` vem de `?client_id=` query param

---

## Desk — Painel de Atendimento

### Componentes

| Arquivo | Responsabilidade |
|---|---|
| `src/app/desk/page.tsx` | Server component — resolve clientId, renderiza DeskShell |
| `src/app/desk/layout.tsx` | Auth check, força dynamic |
| `src/components/desk/desk-shell.tsx` | Shell 2 colunas — lista + chat, Realtime global |
| `src/components/desk/conversation-list.tsx` | Sidebar com tabs de stage + lista de cards |
| `src/components/desk/chat-view.tsx` | Chat com histórico, ações e input de operador |

### Stages das conversas

```
bot_triage     → bot está atendendo (padrão ao criar)
awaiting_human → bot fez handoff, aguardando operador
in_service     → operador assumiu, pode enviar mensagens
resolved       → finalizado
```

### Ações do operador

- **Assumir** (de `bot_triage` ou `awaiting_human`): cria `ai_pauses` (24h), muda para `in_service`
- **Devolver ao bot** (de `in_service`): remove `ai_pauses`, muda para `bot_triage`
- **Finalizar**: remove `ai_pauses`, muda para `resolved`

### Realtime

- Canal `desk:{clientId}` escuta mudanças na tabela `conversations` filtradas por `client_id`
- Canal `chat:{conversationId}` escuta INSERT em `messages` e UPDATE em `conversations`
- Notificações via toast (Sonner) + browser Notification API para `awaiting_human`

### UI/UX

- Sidebar padrão abre em "Todas ativas" (exclui resolved)
- Conversas com `stage = NULL` (legado Chatwoot) são excluídas pelo filtro `client_id` — não aparecem no Desk
- Input de mensagem bloqueado até assumir a conversa
- Operador pode assumir direto do `bot_triage` (não precisa esperar handoff)

---

## Funcionalidades do painel admin

### Dashboard
- Lista de clientes com status visual (WhatsApp, Google, Bot)
- Contadores: ativos, desconectados, pendentes, total
- Health check em tempo real (polling Evolution a cada 30s)
- Audit log recente

### Página do cliente
- Status cards (WhatsApp, Google, Bot)
- Reconectar WhatsApp / renovar Google
- Editar configuração do bot
- **Pausar/Ativar** — para/retoma o bot
- **Resetar histórico** — apaga messages/conversations/ai_pauses/appointments para testes
- **Apagar cliente** — remove tudo
- **Desk** — link direto para `/desk?client_id={id}`
- Métricas básicas e audit log

### Pipeline
- Kanban das conversas por stage_label (sistema legado de labels Chatwoot)
- ⚠️ Mostra conversas **antigas** (pré-migration) que usam labels, não o campo `stage`
- As conversas do novo pipeline Evolution (com campo `stage`) aparecem no **Desk**, não no Pipeline

---

## Stack técnica

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript (ignoreBuildErrors: true no next.config.ts)
- **Estilo**: Tailwind CSS + shadcn/ui
- **UI Dialogs**: `@base-ui/react/dialog` — NÃO usar alert-dialog (não existe nesse projeto)
- **Datas**: JavaScript nativo — `date-fns` NÃO está instalado
- **Banco**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/senha para admins)
- **Realtime**: Supabase Realtime (postgres_changes) — usado pelo Desk
- **Deploy**: EasyPanel — serviço `testeworkflow`, projeto `panel`
- **Build**: Nixpacks 1.41.0
- **Porta**: 80 (EasyPanel seta PORT=80)

### Gotchas de deploy
- `NEXT_PUBLIC_*` devem estar no `nixpacks.toml` para build time
- `createAiClient()` deve ser chamado DENTRO das funções, nunca no module level
- O SIGTERM nos logs após "Ready" é o container **anterior** sendo finalizado (normal)
- `NEXT_PUBLIC_APP_URL` com trailing slash é tratado com `.replace(/\/$/, '')`
- Páginas que fazem queries Supabase precisam de `export const dynamic = 'force-dynamic'`

---

## Comandos

- `npm run dev` — Dev server
- `npm run build` — Build de produção
- `npm run lint` — ESLint

## Convenções

- Server Components por padrão; `"use client"` só quando necessário
- API routes em `src/app/api/`
- Variáveis sensíveis via env, nunca no código
- Commits em português, imperativos, < 72 chars
- Prefixo `panel_` nas tabelas do painel
- Loading states + toast notifications em toda operação assíncrona
- Verificar CLAUDE.md e tabelas existentes antes de criar qualquer nova tabela ou coluna
