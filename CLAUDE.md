# CLAUDE.md — Painel Admin Multi-Tenant (Sales Tec)

## Visão geral

Painel administrativo para escalar o onboarding de clientes do sistema de chatbot
de agendamento da Sales Tec. O sistema já funciona pra um cliente — o painel
permite replicar o fluxo para novos clientes de forma padronizada e profissional.

O mercado-alvo são profissionais de saúde (médicos, dentistas, psicólogos, fisioterapeutas)
e negócios de serviços que agendam por WhatsApp. Cada cliente é um profissional/clínica
que contrata o serviço da Sales Tec.

Stack existente (NÃO modificar): Evolution API + n8n + Chatwoot + Supabase + Google Calendar.
Tudo roda em Docker via EasyPanel no servidor srv1084294.

## Arquitetura existente

```
Paciente (WhatsApp)
  ↓ mensagem
Evolution API v2.3.7 (Baileys, porta 8080)
  ↓ webhook por instância → identifica o cliente pelo instanceName
n8n (porta 5678) — AI Agent (GPT-5.1) + Google Calendar tools
  │ ↓ busca config do cliente no Supabase (panel_clients + panel_bot_config)
  │ ↓ usa prompt/horários/calendar_id específicos do cliente
  ↓ resposta
Evolution API → envia msg de volta pro WhatsApp
  ↓ integração nativa bidirecional
Chatwoot v4.9.1 EE (porta 3000) — painel de atendimento humano

Supabase (PostgreSQL 15.8, Kong porta 8000) — banco central de dados
Google Calendar — agendamento via OAuth2 (conta do profissional)
```

## Fluxo do bot (workflow principal do n8n)

1. Webhook recebe msg da Evolution API (payload contém instanceName)
2. Filtra incoming vs outgoing
3. Supabase: busca/cria contato → busca/cria conversa
4. Se áudio → transcreve (OpenAI/Gemini). Se imagem → analisa (OpenAI)
5. Buffer de mensagens (Wait + Aggregate) pra não responder cada msg individual
6. AI Agent (GPT-5.1 + Redis memory) processa a conversa
7. Sub-agente Calendar Manager: checa disponibilidade, cria/atualiza/deleta eventos
8. Supabase: salva appointments, atualiza status da conversa, seta labels
9. Evolution API: envia resposta pro WhatsApp
10. Chatwoot: sincroniza status (pending/open)

Lógica importante:
- Trava de IA (ai_pauses): lock de 10 min pra evitar respostas duplicadas
- Buffer rules: agrega mensagens antes de processar
- Structured output parser: AI retorna JSON com calendar_action, labels, handoff_to_human
- Se risco/dúvida: handoff_to_human=true, não altera agenda

## URLs dos serviços

| Serviço | URL pública | Porta interna |
|---|---|---|
| Evolution API | https://chatsales-evolution-api.yvssrw.easypanel.host | 8080 |
| n8n | https://chatsales-n8n.yvssrw.easypanel.host | 5678 |
| Chatwoot | https://chatsales-chatwoot.yvssrw.easypanel.host | 3000 |
| Supabase API (Kong) | ⚠️ verificar domínio no EasyPanel | 8000 |
| Supabase Studio | ⚠️ verificar domínio no EasyPanel | 3000 |

## Credenciais (variáveis de ambiente do painel)

```env
# Evolution API
EVOLUTION_API_URL=https://chatsales-evolution-api.yvssrw.easypanel.host
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11

# Chatwoot
CHATWOOT_URL=https://chatsales-chatwoot.yvssrw.easypanel.host
CHATWOOT_API_TOKEN=SXe3DqFiM2ZmAQa9LHJZTS5f
CHATWOOT_ACCOUNT_ID=1

# Supabase (⛔ KEYS PADRÃO — trocar antes de produção)
NEXT_PUBLIC_SUPABASE_URL=https://[SUPABASE_KONG_URL]
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q

# n8n (⚠️ API precisa ser habilitada pelo Fábio em Settings → API)
N8N_URL=https://chatsales-n8n.yvssrw.easypanel.host
N8N_API_KEY=

# Google OAuth (criar no Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Tabelas existentes no Supabase (NÃO modificar — o sistema n8n depende delas)

- **contacts** — contatos do WhatsApp
- **conversations** — conversas (com status, timestamps de last incoming/outgoing)
- **messages** — mensagens (humanas e IA, com message IDs do Chatwoot)
- **appointments** — agendamentos (create/update/delete actions, vinculados à conversa)
- **ai_pauses** — trava de IA (lock de 10 min contra respostas duplicadas)
- **followup_logs** — logs do pipeline de follow-up (B.1-B.5)
- **telegram_chat_memory** — memória do bot Telegram (separado)

Schema completo:

### ai_pauses (trava de IA contra respostas duplicadas)
- conversation_id (text, PK, NOT NULL)
- paused_until (timestamptz)
- paused_reason (text)
- paused_by (text)
- updated_at (timestamptz, NOT NULL)

### appointments (agendamentos no Google Calendar)
- id (uuid, PK)
- conversation_id (uuid, NOT NULL)
- contact_id (uuid)
- google_event_id (text, NOT NULL)
- title (text)
- start_at (timestamptz, NOT NULL)
- end_at (timestamptz, NOT NULL)
- modality (text)
- status (text)
- confirmation_sent_at (timestamptz)
- reminder_sent_at (timestamptz)
- confirmation_response (text)
- created_at (timestamptz)
- updated_at (timestamptz)
- meet_link (text)

### contacts (contatos do WhatsApp/Chatwoot)
- id (uuid, PK)
- chatwoot_id (bigint, NOT NULL)
- name (text)
- identifier (text)
- created_at (timestamptz)
- phone_number (text)

### conversations (conversas vinculadas ao Chatwoot)
- id (uuid, PK)
- chatwoot_conversation_id (bigint, NOT NULL)
- contact_id (uuid)
- status (USER-DEFINED enum)
- account_id (integer)
- updated_at (timestamptz)
- chatwoot_contact_id (bigint)
- labels (ARRAY, NOT NULL)
- last_incoming_at (timestamptz)
- last_outgoing_at (timestamptz)
- last_outgoing_by (text)
- appointment_status (text)
- followup_cadence (text)
- last_followup_at (timestamptz)

### followup_logs (logs do pipeline de follow-up B.1-B.5)
- id (uuid, PK)
- conversation_id (uuid, NOT NULL)
- contact_id (uuid)
- workflow_name (varchar, NOT NULL)
- step_name (varchar, NOT NULL)
- message_sent (text)
- sent_at (timestamptz)

### messages (mensagens humanas e IA)
- id (uuid, PK)
- chatwoot_message_id (bigint, NOT NULL)
- conversation_id (uuid)
- content (text)
- content_type (text)
- sender_type (text)
- created_at (timestamptz)
- from_who (text)
- chatwoot_conversation_id (text)
- source_id (text)

### telegram_chat_memory (bot Telegram — separado, ignorar)
- id (bigint, PK)
- session_id (text, NOT NULL)
- role (text, NOT NULL)
- content (text, NOT NULL)
- metadata (jsonb)
- created_at (timestamptz)

---

## Novas tabelas do painel (criar no Supabase — schema public, prefixo panel_)

### panel_clients
Registro central de cada cliente onboardado.

- id (uuid, PK, default gen_random_uuid())
- name (text, NOT NULL) — nome do negócio/clínica (ex: "Clínica Dr. Benito")
- owner_name (text, NOT NULL) — nome do responsável
- phone (text) — telefone de contato do dono (não é o número do WhatsApp do bot)
- email (text, NOT NULL)
- status (text, NOT NULL, default 'draft') — ver enum abaixo
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

Status enum: draft → pending_whatsapp → pending_google → configuring → active → paused → disconnected

### panel_whatsapp_config
Configuração da instância WhatsApp do cliente.

- id (uuid, PK, default gen_random_uuid())
- client_id (uuid, FK → panel_clients, UNIQUE)
- evolution_instance_name (text, UNIQUE, NOT NULL) — nome na Evolution API (slug do cliente)
- evolution_instance_id (text) — UUID retornado pela Evolution
- evolution_instance_token (text) — token da instância
- connection_status (text, default 'disconnected') — open, connecting, disconnected
- connected_phone (text) — número que escaneou o QR (preenchido após conexão)
- connected_at (timestamptz)
- disconnected_at (timestamptz)
- webhook_url (text) — URL do webhook configurado (aponta pro n8n)
- chatwoot_inbox_id (integer) — ID da inbox criada automaticamente
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### panel_google_config
Credenciais OAuth2 do Google Calendar do cliente.

- id (uuid, PK, default gen_random_uuid())
- client_id (uuid, FK → panel_clients, UNIQUE)
- google_email (text) — email da conta Google autorizada
- calendar_id (text) — ID do calendário (geralmente o email)
- access_token (text) — ⚠️ criptografar em produção
- refresh_token (text) — ⚠️ criptografar em produção
- token_expiry (timestamptz)
- scopes (text[], default '{https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events}')
- authorized_at (timestamptz)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### panel_bot_config
Configuração completa do bot/AI Agent por cliente. Cada campo corresponde a um
parâmetro que o painel expõe na UI e que o workflow do n8n consulta em runtime.

- id (uuid, PK, default gen_random_uuid())
- client_id (uuid, FK → panel_clients, UNIQUE)

**— Perfil do profissional/negócio —**
- professional_name (text, NOT NULL) — "Dr. João Silva"
- professional_title (text) — "Médico Cardiologista", "Dentista", "Psicóloga"
- professional_register (text) — CRM/CRO/CRP (ex: "CRM-RJ 12345")
- business_name (text) — "Clínica Coração Saudável" (pode diferir do panel_clients.name)
- business_segment (text) — "medicina", "odontologia", "psicologia", "fisioterapia", "estética", "outro"
- business_address (text) — endereço físico (opcional, pra bot informar ao paciente)
- business_phone (text) — telefone fixo/comercial (diferente do WhatsApp)

**— Serviços oferecidos —**
- services (jsonb, NOT NULL, default '[]') — lista de serviços configuráveis:
  Estrutura: [{ "name": "Consulta Cardiológica", "duration_minutes": 60, "modality": "presencial", "price": 350.00, "active": true }, ...]
  Modalidades: "presencial", "teleconsulta", "ambos"
  Se vazio, bot assume consulta genérica de 60 min

**— Horários de atendimento —**
- working_hours (jsonb, NOT NULL) — horários por dia da semana:
  Estrutura: { "monday": { "enabled": true, "start": "08:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00" }, "tuesday": { ... }, ... }
  O bot usa isso pra filtrar disponibilidade e informar ao paciente
- appointment_duration_default (integer, NOT NULL, default 60) — duração padrão em minutos
- appointment_buffer_minutes (integer, default 15) — intervalo entre consultas
- max_advance_booking_days (integer, default 60) — agendamento com até X dias de antecedência
- min_advance_booking_hours (integer, default 2) — mínimo de horas de antecedência pra agendar
- allow_same_day_booking (boolean, default true) — permite agendar pro mesmo dia?

**— Personalidade e comportamento do AI Agent —**
- ai_greeting_message (text) — mensagem de boas-vindas (primeira interação):
  Default: "Olá! Sou o assistente virtual do(a) {professional_name}. Como posso ajudar?"
- ai_tone (text, default 'professional_friendly') — tom da IA:
  Opções: "formal", "professional_friendly", "casual", "empathetic"
  Formal: "Prezado(a), como posso auxiliá-lo(a)?"
  Professional_friendly: "Olá! Como posso ajudar?"
  Casual: "Oi! Tudo bem? Como posso te ajudar?"
  Empathetic: "Olá! Fico feliz em ajudar. Como você está?"
- ai_language (text, default 'pt-BR')
- ai_custom_instructions (text) — instruções adicionais livres que vão no system prompt:
  Ex: "O paciente deve ser sempre orientado a trazer exames anteriores"
  Ex: "Não agendar em feriados nacionais"
  Ex: "Para teleconsulta, sempre informar que o link do Google Meet será enviado"
- ai_fallback_message (text) — mensagem quando o bot não entende:
  Default: "Não consegui entender. Posso te ajudar com agendamento, reagendamento ou cancelamento?"
- ai_handoff_message (text) — mensagem ao transferir pra humano:
  Default: "Vou transferir para nossa equipe para melhor atendê-lo(a). Aguarde um momento."

**— Mensagens automáticas (follow-up pipeline) —**
- followup_enabled (boolean, default true) — ativa pipeline de follow-up (B.1-B.5)
- followup_confirmation_hours_before (integer, default 24) — confirmação X horas antes
- followup_reminder_hours_before (integer, default 2) — lembrete X horas antes
- followup_noshow_enabled (boolean, default true) — ativa gestão de no-show
- msg_confirmation (text) — template de confirmação:
  Default: "Olá {patient_name}! Lembramos da sua consulta com {professional_name} amanhã às {time}. Pode confirmar? Responda SIM ou NÃO."
- msg_reminder (text) — template de lembrete:
  Default: "Olá {patient_name}! Sua consulta com {professional_name} é daqui a 2 horas, às {time}. Aguardamos você!"
- msg_noshow (text) — template de no-show:
  Default: "Olá {patient_name}, notamos que você não compareceu à consulta. Gostaria de reagendar?"
- msg_outside_hours (text) — resposta fora do horário:
  Default: "Obrigado pelo contato! Nosso horário de atendimento é {working_hours_summary}. Retornaremos assim que possível."

**— Regras de handoff (transferência pra humano) —**
- handoff_on_negative_sentiment (boolean, default true) — transfere se paciente irritado
- handoff_on_medical_urgency (boolean, default true) — transfere se descreve urgência
- handoff_on_unknown_intent (boolean, default false) — transfere se não entende após 2 tentativas
- handoff_max_ai_turns (integer, default 20) — máximo de turnos antes de forçar handoff
- handoff_keywords (text[], default '{}') — palavras que forçam handoff imediato:
  Ex: ["reclamação", "ouvidoria", "falar com humano", "atendente"]

**— Configurações de agendamento no Google Calendar —**
- calendar_event_title_template (text, default 'Consulta {service_name} — {patient_name}')
- calendar_event_description_template (text) — descrição do evento:
  Default: "Paciente: {patient_name}\nTelefone: {patient_phone}\nServiço: {service_name}\nAgendado via Sales Chat"
- calendar_create_meet_link (boolean, default false) — gera link Google Meet automaticamente
- calendar_send_invite_to_patient (boolean, default false) — envia convite pro email do paciente
- calendar_color_id (text) — cor do evento no Google Calendar (1-11)

**— Configurações do Chatwoot —**
- chatwoot_auto_resolve_hours (integer, default 24) — auto-resolver conversa após X horas sem msg
- chatwoot_working_hours_enabled (boolean, default true) — sincronizar horários com Chatwoot
- chatwoot_assign_to_agent_id (integer) — ID do agente padrão no Chatwoot

**— Timestamps —**
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### panel_onboarding_sessions
Sessões de onboarding em andamento (link público pro cliente).

- id (uuid, PK, default gen_random_uuid())
- client_id (uuid, FK → panel_clients)
- token (text, UNIQUE, NOT NULL) — token da URL pública (UUID ou nanoid)
- step_completed (text, default 'none') — none, whatsapp, google, config, done
- whatsapp_connected (boolean, default false)
- google_connected (boolean, default false)
- config_completed (boolean, default false)
- expires_at (timestamptz, NOT NULL) — ex: 48h após criação
- created_at (timestamptz, default now())

### panel_health_checks
Log de health checks das instâncias.

- id (uuid, PK, default gen_random_uuid())
- client_id (uuid, FK → panel_clients)
- service (text, NOT NULL) — 'whatsapp', 'google_calendar', 'chatwoot'
- status (text, NOT NULL) — 'ok', 'warning', 'error'
- details (text)
- response_time_ms (integer) — tempo de resposta em ms
- checked_at (timestamptz, default now())

### panel_audit_log
Log de ações administrativas (quem fez o quê).

- id (uuid, PK, default gen_random_uuid())
- admin_email (text, NOT NULL) — email do admin que fez a ação
- action (text, NOT NULL) — 'client_created', 'client_paused', 'whatsapp_reconnected', 'config_updated', etc
- client_id (uuid, FK → panel_clients)
- details (jsonb) — detalhes da ação (old/new values se for update)
- created_at (timestamptz, default now())

---

## Stack técnica do painel

- **Framework**: Next.js 15 (App Router)
- **Linguagem**: TypeScript (strict mode)
- **Estilo**: Tailwind CSS + shadcn/ui
- **Banco**: Supabase (instância existente — novas tabelas panel_*)
- **Auth do painel**: Supabase Auth (email/senha para admins — Fábio e Bruno)
- **Deploy**: EasyPanel (projeto chatsales, novo serviço "admin")
- **Build**: Nixpacks (detecta Next.js automaticamente)

## Funcionalidades do painel

### 1. Dashboard
- Lista de clientes com status visual de cada serviço (WhatsApp ●, Google ●, Bot ●)
- Cards com contadores: ativos, desconectados, pendentes, total
- Health check em tempo real (polling do connectionState da Evolution a cada 30s)
- Últimas ações (audit log resumido)

### 2. Onboarding wizard (novo cliente) — 5 etapas
Step-by-step com progresso visual:

**Etapa 1 — Dados do negócio:**
- Nome do negócio, nome do responsável, email, telefone
- Segmento (dropdown: medicina, odontologia, psicologia, fisioterapia, estética, outro)

**Etapa 2 — WhatsApp:**
- Painel cria instância na Evolution API automaticamente
- Exibe QR code (polling a cada 3s até conexão)
- Mostra status em tempo real (waiting → scanning → connected)
- Opção de gerar link público pro cliente escanear remotamente

**Etapa 3 — Google Calendar:**
- Botão "Conectar Google Calendar" → OAuth flow
- Após autorização, mostra email conectado e lista de calendários
- Seleção do calendário pra usar

**Etapa 4 — Configuração do bot:**
Formulário dividido em seções colapsáveis:
- **Perfil profissional**: nome, título, registro, endereço
- **Serviços**: adicionar/remover serviços (nome, duração, modalidade, preço)
- **Horários**: grid visual seg-dom com horários de início/fim e intervalo
- **Comportamento da IA**: tom, mensagem de boas-vindas, instruções customizadas
- **Follow-up**: toggles pra cada estágio (confirmação, lembrete, no-show)
- **Templates de mensagem**: campos editáveis com preview e variáveis disponíveis
- **Regras de handoff**: toggles + campo de keywords
- **Google Calendar**: template do evento, criar Meet link, cor do evento
- **Avançado**: buffer timing, max turnos, auto-resolver Chatwoot
Cada seção tem defaults sensatos — o cliente pode aceitar tudo e ativar em 30s.

**Etapa 5 — Revisão e ativação:**
- Resumo de todas as configs
- Botão "Ativar cliente"
- Painel configura tudo (n8n webhook, Chatwoot working hours, etc)

### 3. Link de onboarding pro cliente
URL pública (ex: admin.dominio.com/onboard/TOKEN):
- Página clean, sem login necessário
- QR code do WhatsApp (atualiza em tempo real)
- Botão "Conectar Google Calendar" (OAuth)
- Formulário simplificado de config (somente campos essenciais)
- Barra de progresso visual
- Expira em 48h

### 4. Gerenciamento de clientes (página individual)
- **Status geral**: cards com WhatsApp (conectado/desconectado), Google (token válido/expirado), Bot (ativo/pausado)
- **Reconectar WhatsApp**: gera novo QR code inline
- **Renovar Google**: botão de re-auth
- **Editar configuração**: mesmo formulário da etapa 4, pré-preenchido
- **Pausar/Ativar**: toggle com confirmação
- **Métricas básicas**: total de conversas, agendamentos, taxa de no-show (lê das tabelas existentes)
- **Audit log**: histórico de ações neste cliente

### 5. Configurações do painel
- Gerenciar admins (convite por email via Supabase Auth)
- Defaults globais (valores padrão pra novos clientes)
- Configurar Google Cloud OAuth credentials (Client ID/Secret)

## APIs usadas pelo painel

### Evolution API
```
POST   /instance/create                     — cria instância (retorna QR base64)
GET    /instance/connect/{instance}         — gera novo QR
GET    /instance/connectionState/{instance} — status conexão
GET    /instance/fetchInstances             — lista instâncias
DELETE /instance/delete/{instance}          — remove instância
POST   /chatwoot/set/{instance}             — configura integração Chatwoot
PUT    /instance/webhook/{instance}         — configura webhook
```
Header: `apikey: 429683C4C977415CAAFCCE10F7D57E11`

Na criação da instância, setar:
- integration: WHATSAPP-BAILEYS
- chatwoot: { enabled: true, accountId: "1", token: "SXe3DqFiM2ZmAQa9LHJZTS5f", url: "https://chatsales-chatwoot.yvssrw.easypanel.host", nameInbox: CLIENT_NAME }
- webhook: { url: "https://chatsales-n8n.yvssrw.easypanel.host/webhook/INSTANCE_NAME", events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"] }

### Chatwoot API
```
GET    /api/v1/accounts/1/inboxes           — lista inboxes
POST   /api/v1/accounts/1/inboxes           — cria inbox
PATCH  /api/v1/accounts/1/inboxes/{id}      — atualiza inbox (working hours, etc)
GET    /api/v1/accounts/1/conversations     — lista conversas
GET    /api/v1/accounts/1/agents            — lista agentes
```
Header: `api_access_token: SXe3DqFiM2ZmAQa9LHJZTS5f`

### Google OAuth2
```
Authorization: https://accounts.google.com/o/oauth2/v2/auth
Token: https://oauth2.googleapis.com/token
Refresh: POST https://oauth2.googleapis.com/token (grant_type=refresh_token)
Calendar list: GET https://www.googleapis.com/calendar/v3/users/me/calendarList
Scopes: https://www.googleapis.com/auth/calendar, https://www.googleapis.com/auth/calendar.events
Redirect: https://[PAINEL_URL]/api/auth/google/callback
```

### Supabase (direto via @supabase/supabase-js)
Usar service_role key nas API routes (server-side) e anon key no client.
RLS: habilitar nas tabelas panel_* com policies pra admin auth.

## Lógica multi-tenant — como o n8n parametriza por cliente

O webhook do n8n recebe o instanceName no payload da Evolution API.
O workflow usa isso pra buscar a config do cliente:

1. Extrai instanceName do payload
2. SELECT * FROM panel_whatsapp_config WHERE evolution_instance_name = instanceName
3. Pega client_id → SELECT * FROM panel_bot_config WHERE client_id = X
4. Usa os campos do panel_bot_config pra:
   - Montar o system prompt do AI Agent (professional_name, ai_tone, ai_custom_instructions, services, working_hours)
   - Configurar o calendar_id (SELECT calendar_id FROM panel_google_config WHERE client_id = X)
   - Aplicar regras de handoff
   - Formatar templates de mensagem
   - Definir appointment_duration_default

O que muda por cliente:
- Instância WhatsApp (nome, QR, número conectado)
- Google Calendar credentials + calendar_id
- Toda a config do bot (panel_bot_config)
- Inbox e working hours no Chatwoot

O que é compartilhado:
- Workflow n8n (um único, parametrizado)
- Account do Chatwoot (ID 1, múltiplas inboxes)
- API key da OpenAI (custo do Fábio/Sales Tec)
- Infraestrutura Supabase (mesma instância)

## Variáveis de template disponíveis nas mensagens

O painel deve mostrar ao usuário quais variáveis pode usar nos templates:
- {patient_name} — nome do paciente
- {patient_phone} — telefone do paciente
- {professional_name} — nome do profissional (de panel_bot_config)
- {professional_title} — título do profissional
- {business_name} — nome do negócio
- {service_name} — nome do serviço agendado
- {date} — data do agendamento (DD/MM/YYYY)
- {time} — horário do agendamento (HH:MM)
- {day_of_week} — dia da semana por extenso
- {working_hours_summary} — resumo dos horários de atendimento
- {meet_link} — link do Google Meet (se habilitado)

## Comandos

- `npm run dev` — Dev server (porta 3000)
- `npm run build` — Build de produção
- `npm run lint` — ESLint

## Convenções

- Server Components por padrão; "use client" só quando necessário
- API routes em src/app/api/ para webhooks e callbacks OAuth
- Variáveis sensíveis via env, nunca no código
- Tratamento de erro em toda chamada de API externa (try/catch + fallback UI)
- Commits em português, imperativos, < 72 chars
- Prefixo panel_ nas tabelas novas pra não conflitar com as existentes
- Validação de formulários com zod
- Loading states em toda operação assíncrona
- Toast notifications pra feedback de ações (sucesso/erro)
- Responsivo (funcionar em mobile pra onboarding do cliente)

## Referência
- docs/infra/INFRA-COMPLETA-CHATSALES.md — mapa completo da infraestrutura
- docs/infra/wf-principal.json — workflow principal do n8n (94K)
- docs/infra/wf-sub.json — sub-workflow Calendar Manager
- docs/infra/wf-calendar.json — workflow Calendar MCP
- docs/infra/wf-confirmacao.json — workflow de confirmação 24h
- (schema das tabelas existentes está inline acima neste documento)
