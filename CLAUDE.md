# CLAUDE.md — Painel Admin Multi-Tenant (Sales Tec)

## Visão geral

Painel administrativo para escalar o onboarding de clientes do sistema de chatbot
de agendamento da Sales Tec. Cada cliente é um profissional/clínica que contrata
o serviço da Sales Tec.

O mercado-alvo são profissionais de saúde (médicos, dentistas, psicólogos, fisioterapeutas)
e negócios de serviços que agendam por WhatsApp.

**O bot engine foi migrado do n8n para código nativo Next.js.** O n8n ainda existe na infra
mas NÃO É MAIS usado para processar mensagens dos clientes do painel.

---

## Arquitetura atual

```
Paciente (WhatsApp)
  ↓ mensagem
Evolution API v2.3.7 (Baileys)
  ↓ integração nativa bidirecional
Chatwoot v4.9.1 EE — cria conversa, dispara webhook
  ↓ POST /api/webhooks/chatwoot (no painel Next.js)
Bot Engine (src/lib/bot/) — pipeline nativo Next.js
  ↓ identifica cliente pelo chatwoot_account_id
  ↓ upsert contact/conversation no Supabase
  ↓ AI Agent (OpenAI gpt-4o-mini) com system prompt dinâmico
  ↓ dispatch: envia resposta via Evolution API
Evolution API → WhatsApp (resposta ao paciente)

Supabase (PostgreSQL) — banco central
Google Calendar — agendamento via OAuth2
```

### Arquitetura multi-tenant — Caminho B (Chatwoot por Account)

Cada cliente tem sua própria **Chatwoot Account** isolada (não apenas inbox).
O painel cria automaticamente:
- Uma Account no Chatwoot (via platform API)
- Um agente bot dedicado nessa account
- Uma instância na Evolution API integrada a essa account
- O webhook da account apontando para o painel

Identificação do cliente no webhook: `payload.account.id` → busca em `panel_whatsapp_config.chatwoot_account_id`.

---

## Bot Engine (src/lib/bot/)

Substituição completa do n8n. Todos os arquivos abaixo são o core do bot.

### Fluxo de uma mensagem

```
POST /api/webhooks/chatwoot
  → normalizePayload()        — filtra outgoing, privado, grupos (@g.us)
  → void runPipeline()        — responde 200 imediatamente, processa em background
      → runBasePipeline()     — resolve cliente, upsert contact/conversation/message
      → runAgent()            — verifica ai_pause, chama OpenAI, retorna AgentOutput
      → dispatch()            — envia WhatsApp, atualiza Chatwoot, limpa ai_pause
```

### Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `src/app/api/webhooks/chatwoot/route.ts` | Endpoint POST, normaliza payload Chatwoot v4.9 |
| `src/lib/bot/pipeline.ts` | Resolve cliente, upsert contact/conversation/message |
| `src/lib/bot/agent.ts` | Verifica ai_pause, chama OpenAI com structured output |
| `src/lib/bot/dispatcher.ts` | Envia resposta WhatsApp, atualiza Chatwoot, limpa ai_pause |
| `src/lib/bot/system-prompt.ts` | Monta system prompt dinâmico a partir do panel_bot_config |
| `src/lib/bot/output-schema.ts` | Schema Zod do JSON estruturado retornado pela IA |
| `src/lib/bot/calendar-agent.ts` | Checa disponibilidade e cria eventos no Google Calendar |
| `src/lib/ai/client.ts` | Cliente OpenAI/Groq unificado (usa OPENAI_API_KEY se disponível) |

### Detalhes importantes do webhook (Chatwoot v4.9)

- `message_type` vem como string `"incoming"` (não inteiro `0`) — código já trata ambos
- `contact` está em `payload.conversation.meta.sender` (não em `payload.conversation.contact`)
- Grupos filtrados pelo `identifier` terminando em `@g.us`
- Rota whitelistada no middleware de auth em `src/lib/supabase/middleware.ts`

### AI Pause

O `ai_pause` é setado no início do processamento (evita execução dupla se webhook
disparar duas vezes) e **limpo no final do dispatch** (permite próximas mensagens).
Tabela: `ai_pauses` com `conversation_id` (PK) e `paused_until`.

### Checagem de status do cliente

`pipeline.ts` verifica `panel_clients.status` antes de processar.
Se status ≠ `'active'`, ignora silenciosamente. Pausar o cliente no painel
realmente para o bot.

### Sistema de IA

- **Cliente**: `src/lib/ai/client.ts` — usa `OPENAI_API_KEY` se setada, senão `GROQ_API_KEY`
- **Modelo padrão**: `gpt-4o-mini` (recomendado) via `OPENAI_MODEL`
- **Modelo mini** (parse de datas etc): `gpt-4o-mini` ou `OPENAI_MODEL_MINI`
- Groq com `llama-3.3-70b-versatile` funciona mas é menos confiável para JSON estruturado

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
| Chatwoot | https://chatsales-chatwoot.yvssrw.easypanel.host |
| Supabase | https://chatsales-supabase.yvssrw.easypanel.host |

---

## Variáveis de ambiente (EasyPanel — serviço testeworkflow)

```env
# Evolution API
EVOLUTION_API_URL=
EVOLUTION_API_KEY=

# Chatwoot
CHATWOOT_URL=
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

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# n8n (legado, não usado pelo bot engine)
N8N_URL=
N8N_API_KEY=
```

### NEXT_PUBLIC_* e build time

Variáveis `NEXT_PUBLIC_*` precisam estar disponíveis no **build**, não só no runtime.
O `nixpacks.toml` injeta essas vars na fase de build:

```toml
[phases.build]
cmds = ["npm run build"]

[variables]
NEXT_PUBLIC_SUPABASE_URL = "https://chatsales-supabase.yvssrw.easypanel.host"
NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJ..."
NEXT_PUBLIC_APP_URL = "https://panel-testeworkflow.yvssrw.easypanel.host"
```

---

## Tabelas Supabase

### Tabelas do bot (existentes — usadas pelo bot engine nativo)

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
- title (text)
- start_at / end_at (timestamptz)
- modality / status / meet_link (text)
- confirmation_sent_at / reminder_sent_at (timestamptz)
- confirmation_response (text)
- created_at / updated_at (timestamptz)

#### contacts
- id (uuid, PK)
- chatwoot_id (bigint, NOT NULL) — unique constraint principal
- name / phone_number / identifier (text)
- created_at (timestamptz)
- ⚠️ constraint `contacts_phone_account_id_unique` — pipeline trata duplicate key
  fazendo fallback SELECT por phone_number

#### conversations
- id (uuid, PK)
- chatwoot_conversation_id (bigint)
- contact_id (uuid)
- status (enum: pending/open/resolved)
- account_id (integer) — chatwoot_account_id do cliente
- labels (text[])
- last_incoming_at / last_outgoing_at (timestamptz)
- last_outgoing_by / appointment_status / followup_cadence (text)

#### messages
- id (uuid, PK)
- chatwoot_message_id (bigint)
- conversation_id (uuid)
- content / content_type / sender_type / from_who (text)
- chatwoot_conversation_id / source_id (text)
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
- evolution_instance_name (text, UNIQUE) — slug da instância na Evolution API
- evolution_instance_id / evolution_instance_token (text)
- connection_status (text): open / connecting / disconnected
- connected_phone (text)
- chatwoot_account_id (integer) — ⚠️ identifica o cliente no webhook
- chatwoot_inbox_id (integer)
- chatwoot_agent_token (text) — token do agente bot da account isolada
- webhook_url (text)
- connected_at / disconnected_at / created_at / updated_at (timestamptz)

#### panel_google_config
- id (uuid, PK)
- client_id (uuid, FK → panel_clients, UNIQUE)
- google_email / calendar_id (text)
- access_token / refresh_token (text) — ⚠️ criptografar em produção
- token_expiry (timestamptz)
- scopes (text[])

#### panel_bot_config
Config completa do AI Agent por cliente:

**Perfil**: professional_name, professional_title, professional_register, business_name, business_segment, business_address, business_phone

**Serviços**: services (jsonb) — `[{ name, duration_minutes, modality, price, active }]`
Modalidades: `"presencial"` | `"teleconsulta"` | `"ambos"` (expandido no prompt para "presencial ou teleconsulta (online)")

**Horários**: working_hours (jsonb) — `{ monday: { enabled, start, end, break_start, break_end }, ... }`
appointment_duration_default (int, default 60), appointment_buffer_minutes (int, default 15),
max_advance_booking_days (int, default 60), min_advance_booking_hours (int, default 2),
allow_same_day_booking (bool)

**IA**: ai_greeting_message, ai_tone, ai_language, ai_custom_instructions, ai_fallback_message, ai_handoff_message
- ai_tone: `"formal"` | `"professional_friendly"` | `"casual"` | `"empathetic"`
- ai_language: código de idioma (`"pt-BR"`, `"EN"`, `"ES"` etc) — aplicado no system prompt

**Follow-up**: followup_enabled, followup_confirmation_hours_before, followup_reminder_hours_before,
followup_noshow_enabled, msg_confirmation, msg_reminder, msg_noshow, msg_outside_hours

**Handoff**: handoff_on_negative_sentiment, handoff_on_medical_urgency, handoff_on_unknown_intent,
handoff_max_ai_turns, handoff_keywords (text[])

**Calendar**: calendar_event_title_template, calendar_event_description_template,
calendar_create_meet_link, calendar_send_invite_to_patient, calendar_color_id

**Chatwoot**: chatwoot_auto_resolve_hours, chatwoot_working_hours_enabled, chatwoot_assign_to_agent_id

#### panel_onboarding_sessions
- id (uuid, PK)
- client_id (uuid, FK)
- token (text, UNIQUE) — URL pública pro cliente
- step_completed (text): none / whatsapp / google / config / done
- whatsapp_connected / google_connected / config_completed (bool)
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
- service (text): whatsapp / google_calendar / chatwoot
- status (text): ok / warning / error
- details (text)
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
POST   /chatwoot/set/{instance}             — configura integração Chatwoot
PUT    /instance/webhook/{instance}         — configura webhook
POST   /message/sendText/{instance}         — envia mensagem (usado pelo dispatcher)
```
Header: `apikey: EVOLUTION_API_KEY`

Na criação da instância, setar Chatwoot com a account isolada do cliente
(não a account 1). O webhook deve apontar para o painel, não para o n8n.

### Chatwoot API (por account isolada do cliente)
```
POST   /auth/sign_in                          — login (plataforma)
GET    /api/v1/accounts/{id}/inboxes          — lista inboxes
POST   /api/v1/accounts/{id}/conversations/{id}/labels — atualiza labels
PATCH  /api/v1/accounts/{id}/conversations/{id} — atualiza status
```
Cada cliente usa seu próprio `chatwoot_agent_token` (de `panel_whatsapp_config`).

**Webhook configurado na account do cliente**: aponta para
`https://panel-testeworkflow.yvssrw.easypanel.host/api/webhooks/chatwoot`

### Google OAuth2
```
Authorization: https://accounts.google.com/o/oauth2/v2/auth
Token: https://oauth2.googleapis.com/token
Scopes: calendar, calendar.events
Redirect: {NEXT_PUBLIC_APP_URL}/api/auth/google/callback
```

---

## Rotas da API do painel

### Bot
- `POST /api/webhooks/chatwoot` — recebe eventos do Chatwoot (público, sem auth)

### Clientes
- `GET/POST /api/clients` — lista / cria cliente
- `GET/PATCH/DELETE /api/clients/[id]` — detalhe / atualiza / deleta
- `POST /api/clients/[id]/activate` — ativa cliente
- `DELETE /api/clients/[id]/history` — **reseta histórico**: apaga messages, conversations, ai_pauses, appointments do cliente

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

Rotas públicas (sem auth):
- `/api/auth/callback`
- `/api/auth/google/callback`
- `/api/auth/google/public`
- `/api/health/*`
- `/connect/*` (onboarding público)
- rotas com `/public-qr`
- **`/api/webhooks/chatwoot`** ← crítico, deve permanecer público

---

## Funcionalidades do painel

### Dashboard
- Lista de clientes com status visual (WhatsApp, Google, Bot)
- Contadores: ativos, desconectados, pendentes, total
- Health check em tempo real (polling Evolution a cada 30s)
- Audit log recente

### Onboarding wizard (5 etapas)
1. Dados do negócio (nome, responsável, email, segmento)
2. WhatsApp — cria instância Evolution + QR code em tempo real
3. Google Calendar — OAuth flow, seleciona calendário
4. Configuração do bot — formulário completo com seções colapsáveis
5. Revisão e ativação

### Página do cliente
- Status cards (WhatsApp, Google, Bot)
- Reconectar WhatsApp / renovar Google
- Editar configuração do bot
- **Pausar/Ativar** — para/retoma o bot (verificado no pipeline)
- **Resetar histórico** — apaga messages/conversations/ai_pauses/appointments para testes
- **Apagar cliente** — remove tudo (Evolution instance, Chatwoot account, Supabase)
- Métricas básicas e audit log

### Link público de onboarding
- URL: `/connect/[token]` — expira em 48h
- QR code em tempo real, OAuth Google, config simplificada
- Sem login necessário

---

## Stack técnica

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript (ignoreBuildErrors: true no next.config.ts — type check local)
- **Estilo**: Tailwind CSS + shadcn/ui
- **Banco**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/senha para admins)
- **Deploy**: EasyPanel — serviço `testeworkflow`, projeto `panel`
- **Build**: Nixpacks 1.41.0
- **Porta**: 80 (EasyPanel seta PORT=80)

### Gotchas de deploy
- `NEXT_PUBLIC_*` devem estar no `nixpacks.toml` para build time
- `createAiClient()` deve ser chamado DENTRO das funções, nunca no module level (causa erro no build)
- O SIGTERM nos logs após "Ready" é o container **anterior** sendo finalizado (normal com zeroDowntime)
- `NEXT_PUBLIC_APP_URL` com trailing slash é tratado em `getPanelWebhookUrl()` com `.replace(/\/$/, '')`

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
- Validação com zod
- Loading states + toast notifications em toda operação assíncrona
