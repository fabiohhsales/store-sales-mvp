# CLAUDE.md — Painel Admin Multi-Tenant (Sales Tec)

## Visão geral

Painel administrativo para escalar o onboarding de clientes do sistema de chatbot de agendamento da Sales Tec. Cada cliente é um profissional/clínica que contrata o serviço da Sales Tec.

O mercado-alvo são profissionais de saúde (médicos, dentistas, psicólogos, fisioterapeutas) e negócios de serviços que agendam por WhatsApp.

O bot engine foi migrado do n8n para código nativo Next.js. O pipeline de mensagens foi migrado do Chatwoot para direto na Evolution API. n8n e Chatwoot ainda existem na infra mas NÃO SÃO MAIS usados para processar mensagens.

Status deste arquivo no Git:
- `CLAUDE.md` é versionado normalmente no repositório
- não está em `.gitignore`
- último commit confirmado no arquivo: `2026-03-30 08:17:13 -0300`

## Arquitetura atual (pós-migração Evolution direta)

```text
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

NÃO usa mais `chatwoot_account_id`.

### Desk — Painel de Atendimento Humano

Operadores podem ver o fluxo do bot em tempo real e assumir conversas para responder como o número WhatsApp do cliente.

- Rota: `/desk?client_id=<uuid>` (admins) ou `/desk` (operators via `panel_users`)
- Botão de acesso direto na página do cliente admin: `/clients/[id]`
- Realtime via Supabase nos canais `desk:{clientId}` e `chat:{conversationId}`

## Bot Engine (`src/lib/bot/`)

### Fluxo de uma mensagem (Evolution direto)

```text
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
| `src/lib/bot/agent.ts` | Verifica `ai_pause`, chama OpenAI com structured output |
| `src/lib/bot/dispatcher.ts` | Envia resposta WhatsApp, handoff, summary de triagem, limpa `ai_pause` |
| `src/lib/bot/system-prompt.ts` | Monta system prompt dinâmico a partir do `panel_bot_config` |
| `src/lib/bot/output-schema.ts` | Schema Zod do JSON estruturado retornado pela IA |
| `src/lib/bot/calendar-agent.ts` | Checa disponibilidade e cria eventos no Google Calendar |
| `src/lib/ai/client.ts` | Cliente OpenAI/Groq unificado |

### Detalhes do webhook Evolution

- Evento principal: `messages.upsert` — mensagens recebidas
- Evento `connection.update` — sincroniza `connection_status` em `panel_whatsapp_config`
- `fromMe: true` é ignorado
- grupos (`@g.us`) são ignorados
- rota whitelistada no middleware: `isEvolutionWebhook`

### Deduplicação de mensagens

Campo `evolution_message_id` em `messages` com unique partial index. Se a mensagem já existe, o pipeline ignora silenciosamente a entrega duplicada.

### AI Pause

O `ai_pause` é setado quando operador assume a conversa e limpo ao devolver ao bot ou resolver. Tabela: `ai_pauses` com `conversation_id` (PK) e `paused_until`.

### Handoff (bot → humano)

Quando o bot detecta handoff necessário por sentimento negativo, urgência, `max_turns` ou keywords:

1. Envia a `ai_handoff_message` via WhatsApp
2. Gera summary de triagem via OpenAI
3. Muda `stage = 'awaiting_human'` e salva `summary` na conversa
4. Notifica operadores no Desk via Realtime, toast e browser Notification

### Checagem de status do cliente

`pipeline.ts` verifica `panel_clients.status` antes de processar. Se status for diferente de `active`, ignora silenciosamente.

## Sistema de IA

- Cliente: `src/lib/ai/client.ts` — usa `OPENAI_API_KEY` se setada, senão `GROQ_API_KEY`
- Modelo padrão: `gpt-4o-mini` via `OPENAI_MODEL`
- `createAiClient()` deve ser chamado DENTRO das funções, nunca no module level

### System prompt dinâmico

`src/lib/bot/system-prompt.ts` injeta no prompt:

- nome do profissional, título e negócio
- serviços com modalidade expandida (`ambos` → `in-person or online`)
- horários de atendimento formatados
- tom de comunicação (`formal`, `professional_friendly`, `casual`, `empathetic`)
- idioma: prompt base em inglês; para clientes não-inglês, injeta override `You MUST respond only in {lang}. Never use English.`
- instruções customizadas do profissional
- `process_flow_guide`, `objections_guide`, `qualification_questions_guide`, `disengagement_policy_guide`
- regras de handoff, stage labels e formato JSON obrigatório
- instrução anti-alucinação para usar apenas dados do prompt
- uso apenas do primeiro nome do contato para evitar confusão com o negócio do cliente

## URLs dos serviços

| Serviço | URL pública |
|---|---|
| Painel Admin | https://panel-testeworkflow.yvssrw.easypanel.host |
| Evolution API | https://chatsales-evolution-api.yvssrw.easypanel.host |
| n8n (legado) | https://chatsales-n8n.yvssrw.easypanel.host |
| Chatwoot (legado) | https://chatsales-chatwoot.yvssrw.easypanel.host |
| Supabase | https://chatsales-supabase.yvssrw.easypanel.host |

## Variáveis de ambiente (EasyPanel — serviço `testeworkflow`)

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

# App URL
NEXT_PUBLIC_APP_URL=

# IA — preferir OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_MODEL_MINI=gpt-4o-mini
GROQ_API_KEY=

# Google Calendar — conta central Sales Tec
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# n8n (legado)
N8N_URL=
N8N_API_KEY=
```

### `NEXT_PUBLIC_*` e build time

Variáveis `NEXT_PUBLIC_*` precisam estar disponíveis no build, não só no runtime. O `nixpacks.toml` injeta essas vars na fase de build.

## Tabelas Supabase

### Tabelas do bot

#### `ai_pauses`
- `conversation_id` (text, PK)
- `paused_until` (timestamptz)
- `paused_reason` (text)
- `paused_by` (text)
- `updated_at` (timestamptz)

#### `appointments`
- `id` (uuid, PK)
- `conversation_id` (uuid)
- `contact_id` (uuid)
- `google_event_id` (text)
- `title`, `modality`, `status`, `meet_link` (text)
- `start_at`, `end_at`, `confirmation_sent_at`, `reminder_sent_at` (timestamptz)
- `confirmation_response` (text)
- `created_at`, `updated_at` (timestamptz)

#### `contacts`
- `id` (uuid, PK)
- `chatwoot_id` (bigint, nullable desde migration 010)
- `name`, `phone_number`, `identifier` (text)
- `client_id` (uuid, FK → `panel_clients`)
- `created_at` (timestamptz)
- `custom_data` (jsonb) — dados do intake; `_photo_count` é interno
- `intake_completed_at` (timestamptz)
- unique key atual: `phone_number + client_id`

#### `conversations`
- `id` (uuid, PK)
- `chatwoot_conversation_id` (bigint, nullable)
- `contact_id` (uuid)
- `client_id` (uuid, FK → `panel_clients`)
- `status` (text: `open` / `resolved`)
- `account_id` (integer, nullable) — legado Chatwoot
- `labels` (text[])
- `stage` (text) — `bot_triage` | `awaiting_human` | `in_service` | `resolved`
- `stage_changed_at` (timestamptz) — migration 016, usado para analytics/SLA
- `assigned_operator_id` (uuid)
- `resolved_at` (timestamptz)
- `summary` (text)
- `last_incoming_at`, `last_outgoing_at` (timestamptz)
- `last_outgoing_by`, `appointment_status`, `followup_cadence` (text)
- NÃO tem coluna `updated_at`; não incluir em INSERT/UPDATE
- conversas antigas pré-migration 010 podem ter `stage = NULL` e `client_id = NULL`

#### `messages`
- `id` (uuid, PK)
- `chatwoot_message_id` (bigint, nullable)
- `evolution_message_id` (text) — deduplicação do webhook
- `client_id` (uuid, FK → `panel_clients`)
- `conversation_id` (uuid)
- `content`, `content_type`, `sender_type`, `from_who` (text)
- `chatwoot_conversation_id`, `source_id` (text, nullable)
- `created_at` (timestamptz)
- `media_url` (text, nullable) — path do bucket `desk-media`

#### `conversation_operator_notes`
- tabela criada na migration 012
- notas privadas do Desk por conversa
- campos principais: `conversation_id`, `client_id`, `operator_user_id`, `operator_email`, `operator_name`, `content`, `created_at`

#### `canned_responses`
- tabela criada na migration 013 e expandida na 014
- respostas rápidas compartilhadas por cliente e pessoais por operador
- campos principais: `client_id`, `operator_user_id`, `shortcut`, `content`, `created_at`, `updated_at`
- unicidade:
  - compartilhadas: `client_id + shortcut` quando `operator_user_id IS NULL`
  - pessoais: `client_id + operator_user_id + shortcut` quando `operator_user_id IS NOT NULL`

#### `panel_users`
- criada na migration 010
- `id` (uuid, PK = `auth.users.id`)
- `email` (text)
- `role` (text): `admin` | `operator`
- `client_id` (uuid, nullable; obrigatório para operator)
- `display_name` (text, nullable)
- `is_active` (boolean)
- `created_at`, `updated_at` (timestamptz)

### Tabelas do painel (`panel_*`)

#### `panel_clients`
- `id` (uuid, PK)
- `name`, `owner_name`, `email`, `phone` (text)
- `status` (text): `draft` → `pending_whatsapp` → `pending_google` → `configuring` → `active` → `paused` → `disconnected`
- `created_at`, `updated_at` (timestamptz)

#### `panel_whatsapp_config`
- `id` (uuid, PK)
- `client_id` (uuid, FK → `panel_clients`, UNIQUE)
- `evolution_instance_name` (text, UNIQUE) — chave principal de identificação do cliente no webhook
- `evolution_instance_id`, `evolution_instance_token` (text)
- `connection_status` (text): `open` / `connecting` / `disconnected`
- `connected_phone` (text)
- `chatwoot_account_id`, `chatwoot_inbox_id`, `chatwoot_agent_token` (legado)
- `webhook_url` (text)
- `connected_at`, `disconnected_at`, `created_at`, `updated_at` (timestamptz)

#### `panel_google_config`
- `id` (uuid, PK)
- `client_id` (uuid, FK → `panel_clients`, UNIQUE)
- `google_email` (text)
- `calendar_id` (text) — obrigatório
- `access_token`, `refresh_token`, `scopes`, `token_expiry` — mantidos, mas o fluxo atual usa `GOOGLE_REFRESH_TOKEN` global

#### `panel_bot_config`

Configuração completa do AI Agent por cliente.

Perfil:
- `professional_name`
- `professional_title`
- `professional_register`
- `business_name`
- `business_segment`
- `business_address`
- `business_phone`

Serviços e stages:
- `services` (jsonb) — `[{ name, duration_minutes, modality, price, active }]`
- `stage_labels` (jsonb) — funil customizável usado no pipeline legado e em partes do bot/follow-up

Horários:
- `working_hours` (jsonb)
- `appointment_duration_default`
- `appointment_buffer_minutes`
- `max_advance_booking_days`
- `min_advance_booking_hours`
- `allow_same_day_booking`

IA:
- `ai_greeting_message`
- `ai_tone`
- `ai_language`
- `ai_custom_instructions`
- `process_flow_guide`
- `objections_guide`
- `qualification_questions_guide`
- `disengagement_policy_guide`
- `ai_fallback_message`
- `ai_handoff_message`

Intake:
- `intake_enabled`
- `intake_fields`
- `intake_request_photos`
- `intake_photos_count`
- `intake_handoff_after_photos`
- `intake_photo_guide_url`

Follow-up:
- `followup_enabled`
- `followup_confirmation_hours_before`
- `followup_reminder_hours_before`
- `followup_noshow_enabled`
- `msg_confirmation`
- `msg_reminder`
- `msg_noshow`
- `msg_outside_hours`
- `lead_followup_enabled` e mensagens D1/D2/D3/D5/D7
- `atendimento_followup_enabled` e mensagens D1/D2/D4/D7/D10
- `agendado_followup_msg_d2`
- `agendado_followup_msg_minus3h`
- `agendado_followup_msg_minus5min`

Calendar:
- `calendar_event_title_template`
- `calendar_event_description_template`
- `calendar_create_meet_link`
- `calendar_send_invite_to_patient`
- `calendar_color_id`

Chatwoot legado:
- `chatwoot_auto_resolve_hours`
- `chatwoot_working_hours_enabled`
- `chatwoot_assign_to_agent_id`

#### `panel_onboarding_sessions`
- `id` (uuid, PK)
- `client_id` (uuid, FK)
- `token` (text, UNIQUE)
- `step_completed`, `whatsapp_connected`, `google_connected`, `config_completed`
- `expires_at` (timestamptz)

#### `panel_audit_log`
- `id` (uuid, PK)
- `admin_email`, `action` (text)
- `client_id` (uuid, FK)
- `details` (jsonb)
- `created_at` (timestamptz)

#### `panel_health_checks`
- `id` (uuid, PK)
- `client_id` (uuid, FK)
- `service`, `status`, `details` (text)
- `response_time_ms` (int)
- `checked_at` (timestamptz)

## Segurança e RLS

### Migration 017 — `panel_rls_hardening`

Hardening das policies RLS das tabelas `panel_*`:

- escrita restrita a admins
- leitura escopada por `auth.user_role()` e `auth.user_client_id()`
- operadores só leem dados do próprio `client_id`
- `panel_health_checks` e `panel_audit_log` seguem leitura/admin only

## APIs externas

### Evolution API

```text
POST   /instance/create
GET    /instance/connect/{instance}
GET    /instance/connectionState/{instance}
GET    /instance/fetchInstances
DELETE /instance/delete/{instance}
POST   /chatwoot/set/{instance}
POST   /webhook/set/{instance}
POST   /message/sendText/{instance}
```

Header: `apikey: EVOLUTION_API_KEY`

Importante: o endpoint correto para webhook é `POST /webhook/set/{instance}` com body `{ webhook: { url, ... } }`. Não usar `PUT /instance/webhook/{instance}`.

### Google Calendar

Auth via `google.auth.OAuth2` com `GOOGLE_REFRESH_TOKEN` em `src/lib/calendar/client.ts`.

## Rotas da API do painel

### Bot
- `POST /api/webhooks/evolution` — pipeline principal, público
- `POST /api/webhooks/chatwoot` — legado, público

### Desk
- `GET /api/desk/conversations?client_id=&stage=` — lista conversas
- `GET /api/desk/conversations/[id]?client_id=` — histórico completo
- `POST /api/desk/conversations/[id]/action` — `{ action: 'assume'|'return'|'resolve' }`
- `POST /api/desk/conversations/[id]/message` — envia texto via Evolution + persiste
- `POST /api/desk/conversations/[id]/send-media` — envia mídia via Evolution + upload Storage + persiste
- `GET /api/desk/media?msg_id=&conversation_id=` — signed URL do Storage ou fallback Evolution
- `GET /api/desk/stats?client_id=` — contagens por stage
- `GET /api/desk/analytics?client_id=&days=` — métricas do Desk
- `GET /api/desk/analytics/export?client_id=&days=` — export CSV
- `GET /api/desk/conversations/[id]/notes` — lista notas internas
- `POST /api/desk/conversations/[id]/notes` — cria nota interna
- `GET /api/desk/my-canned-responses?client_id=` — lista respostas pessoais
- `POST /api/desk/my-canned-responses?client_id=` — cria resposta pessoal
- `PATCH /api/desk/my-canned-responses/[id]?client_id=` — atualiza resposta pessoal
- `DELETE /api/desk/my-canned-responses/[id]?client_id=` — remove resposta pessoal
- `GET /api/desk/conversations/[id]/assign` — lista operadores elegíveis + responsável atual
- `PATCH /api/desk/conversations/[id]/assign` — atribui responsável
- `POST /api/desk/conversations/[id]/availability` — envia disponibilidades para o paciente
- `DELETE /api/desk/conversations/[id]/clear-intake` — limpa intake da conversa para testes

### Clientes
- `GET/POST /api/clients`
- `GET/PATCH/DELETE /api/clients/[id]`
- `POST /api/clients/[id]/activate`
- `DELETE /api/clients/[id]/history`
- `GET /api/clients/[id]/canned-responses`
- `POST /api/clients/[id]/canned-responses`
- `PATCH /api/clients/[id]/canned-responses/[responseId]`
- `DELETE /api/clients/[id]/canned-responses/[responseId]`

### Auth / OAuth
- `GET /api/auth/callback`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/public`

### Onboarding público
- `GET /connect/[token]`

### Health
- `GET /api/health/[service]`

## Middleware de autenticação

`src/lib/supabase/middleware.ts` protege as rotas.

Rotas públicas:
- `/api/auth/callback`
- `/api/auth/google/*`
- `/api/health/*`
- `/connect/*`
- rotas com `/public-qr`
- `/api/webhooks/chatwoot`
- `/api/webhooks/evolution`
- `/api/desk/*` — público no middleware, autenticado internamente via `resolveDeskUser()`
- `/api/pipeline/*`
- `/api/agenda/*`

### `resolveDeskUser` (`src/lib/desk/auth.ts`)

- operators (`panel_users.role = 'operator'`): `client_id` vem de `panel_users.client_id`
- admins (`panel_users.role = 'admin'`) ou usuários sem `panel_users`: `client_id` vem de `?client_id=`

## Desk — Painel de Atendimento

### Componentes principais

| Arquivo | Responsabilidade |
|---|---|
| `src/app/desk/page.tsx` | Server component — resolve `clientId`, renderiza `DeskShell` |
| `src/app/desk/layout.tsx` | Auth check, força dynamic |
| `src/components/desk/desk-shell.tsx` | Shell 2 colunas — lista + chat + realtime global |
| `src/components/desk/conversation-list.tsx` | Sidebar com tabs de stage |
| `src/components/desk/chat-view.tsx` | Chat, ações, notas, mídia, respostas rápidas, atribuição |

### Stages de conversa no Desk

```text
bot_triage     → bot atendendo
awaiting_human → bot pausado aguardando operador
in_service     → operador assumiu
resolved       → finalizado
```

### Ações do operador

- assumir: cria `ai_pauses`, muda para `in_service`
- devolver ao bot: remove `ai_pauses`, muda para `bot_triage`
- finalizar: remove `ai_pauses`, muda para `resolved`
- atribuir responsável para outro operador elegível

### Recursos já implementados no Desk

- visualização de imagens recebidas com fallback entre Storage e Evolution
- envio de imagem/PDF via chat
- notas internas por conversa
- respostas rápidas compartilhadas por cliente
- respostas rápidas pessoais por operador
- envio de disponibilidades ao paciente
- painel lateral de dados do contato e edição do intake
- limpeza manual do intake para testes

### Realtime

- canal `desk:{clientId}` observa mudanças em `conversations`
- canal `chat:{conversationId}` observa INSERT em `messages` e UPDATE em `conversations`
- notificações via Sonner + browser Notification para `awaiting_human`

### Analytics/SLA

- migration 016 adiciona `stage_changed_at`
- analytics do Desk usam `stage_changed_at` para medir aging e SLA de conversas em `awaiting_human`
- para conversas migradas sem `stage_changed_at`, há fallback com `last_incoming_at`

## Funcionalidades do painel admin

### Dashboard
- lista de clientes com status visual
- contadores de ativos, desconectados, pendentes e total
- health check em tempo real
- audit log recente

### Página do cliente
- status cards de WhatsApp, Google e Bot
- reconectar WhatsApp / renovar Google
- editar configuração do bot
- pausar/ativar o bot
- resetar histórico
- apagar cliente
- link direto para o Desk
- gestão de respostas rápidas compartilhadas do cliente

### Pipeline
- kanban legado por `stage_labels`
- continua separado do fluxo principal do Desk
- conversas do novo pipeline Evolution com `stage` aparecem no Desk

## Cliente ativo: ChoiExpert Hair Clinic

Clínica de transplante capilar em Tessalônica, Grécia. Primeiro cliente real do sistema.

- instance Evolution: `choiexpert`
- client_id Supabase: `3feeb364-86f6-4a2e-9b27-450f69d25752`
- idioma dos pacientes: inglês
- operadores: Nina e Konstantinos

### Fluxo real de vendas da Choi

```text
Novo lead (WhatsApp)
  → Bot coleta: nome, email, data nasc, país, como conheceu, medicações
  → Paciente envia 5 fotos do couro cabeludo
  → Operador avalia fotos e agenda video consultation
  → Operador envia plano cirúrgico (PDF) + orçamento (PDF)
  → Paciente confirma interesse
  → Depósito €1000 + passagem aérea
  → Cirurgia agendada
  → Pacote 2 dias inclui hotel + transporte
```

### O que já foi implementado

- bot responde em inglês por padrão, com override por `ai_language`
- intake estruturado e configurável por cliente
- envio automático da imagem guia de fotos com `intake_photo_guide_url`
- visualização de imagens no Desk com Storage privado
- envio de arquivo pelo Desk
- notas internas no Desk
- respostas rápidas compartilhadas e pessoais
- `stage_changed_at` para analytics/SLA
- hardening de RLS nas tabelas `panel_*`

### Backlog atual

Alta prioridade:
1. Funil de stages customizado no Desk para refletir melhor o pipeline comercial real da Choi

Baixa prioridade:
2. Agendamento de video consultation dedicado

## Stack técnica

- Framework: Next.js 16 (App Router)
- Linguagem: TypeScript
- Estilo: Tailwind CSS + shadcn/ui
- Dialogs: `@base-ui/react/dialog`
- Datas: JavaScript nativo
- Banco: Supabase PostgreSQL
- Auth: Supabase Auth
- Realtime: Supabase Realtime
- Deploy: EasyPanel
- Build: Nixpacks 1.41.0
- Porta: 80

### Gotchas de deploy

- `NEXT_PUBLIC_*` precisam estar no `nixpacks.toml` para build time
- `createAiClient()` deve ser chamado dentro das funções
- `NEXT_PUBLIC_APP_URL` com trailing slash é tratado com `.replace(/\/$/, '')`
- páginas que consultam Supabase precisam de `export const dynamic = 'force-dynamic'`
- `nixpacks.toml` tem `[start] cmd = "npm run start"` explícito
- SIGTERM logo após `Ready` costuma ser o container anterior sendo finalizado

## Migrations de banco

As migrations ficam em `supabase/migrations/` e são aplicadas automaticamente no `npm run start` via `node scripts/migrate.mjs`.

### Sequência relevante hoje

- `010_evolution_migration.sql`
- `011_intake.sql`
- `012_desk_internal_notes.sql`
- `013_canned_responses.sql`
- `014_personal_canned_responses.sql`
- `015_media_storage.sql`
- `016_stage_changed_at.sql`
- `017_panel_rls_hardening.sql`

### Regras para novas migrations

1. Criar `supabase/migrations/NNN_nome.sql` com numeração sequencial
2. Escrever SQL idempotente com `IF NOT EXISTS` / `IF EXISTS`
3. Comitar a migration junto com o código que depende dela

Nunca fazer deploy de código que depende de coluna/tabela nova sem criar a migration antes.

### `migrate.mjs` no primeiro deploy

O script tolera erros de `already exists` e marca a migration como aplicada.

### Supabase Storage — bucket `desk-media`

- criado na migration 015
- bucket privado
- acesso por signed URLs geradas no servidor
- usado para fotos recebidas e arquivos enviados por operadores

## Comandos

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Convenções

- Server Components por padrão; `"use client"` só quando necessário
- API routes em `src/app/api/`
- variáveis sensíveis sempre via env
- commits em português, imperativos e curtos
- prefixo `panel_` nas tabelas do painel
- loading states + toast notifications em operações assíncronas
- verificar `CLAUDE.md` e tabelas existentes antes de criar nova tabela ou coluna
