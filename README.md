# Painel Admin — Sales Tec

Painel administrativo multi-tenant para escalar o onboarding de clientes do chatbot de agendamento da Sales Tec.

O mercado-alvo sao profissionais de saude (medicos, dentistas, psicologos, fisioterapeutas) e negocios de servicos que agendam por WhatsApp. Cada cliente recebe uma instancia WhatsApp propria, conta Chatwoot isolada e configuracao personalizada do bot de IA.

## Arquitetura geral

```
Paciente (WhatsApp)
  |
Evolution API (Baileys) ─── webhook ──→ n8n (AI Agent GPT-4o)
  |                                       |
  ↕ integracao bidirecional               ↓ busca config do cliente no Supabase
Chatwoot (atendimento humano)             ↓ usa prompt/servicos/horarios especificos
                                          ↓ Google Calendar (agendamento)
                                          |
                                        Supabase (PostgreSQL — banco central)
```

**O que e compartilhado entre clientes:**
- Workflow n8n (um unico, parametrizado por `instanceName`)
- API key da OpenAI
- Infraestrutura Supabase

**O que e isolado por cliente:**
- Instancia WhatsApp (Evolution API)
- Account Chatwoot (isolada — cada cliente tem a propria)
- Google Calendar credentials + calendar_id
- Configuracao completa do bot (tom, servicos, horarios, mensagens)

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui**
- **Supabase** (PostgreSQL + Auth + RLS)
- **Evolution API** (WhatsApp via Baileys)
- **Chatwoot** (atendimento humano — accounts isoladas por cliente)
- **n8n** (automacao — workflow unico parametrizado)
- **Google Calendar** (agendamento via OAuth2)

## Funcionalidades

### Dashboard
- Lista de clientes com status visual (WhatsApp, Google, Bot)
- Cards com contadores: ativos, desconectados, pendentes
- Health check em tempo real das instancias WhatsApp
- Audit log resumido

### Onboarding wizard (5 etapas)
1. **Dados do negocio** — nome, responsavel, email, segmento
2. **WhatsApp** — cria instancia Evolution + Account Chatwoot isolada, exibe QR code
3. **Google Calendar** — OAuth flow, selecao de calendario
4. **Configuracao do bot** — perfil, servicos, horarios, tom da IA, templates
5. **Revisao e ativacao** — resumo + botao de ativar

### Link publico de onboarding
URL publica (`/connect/[instancia]`) para o cliente:
- Escanear QR code do WhatsApp (sem login)
- Conectar Google Calendar (OAuth)
- Barra de progresso visual
- Expira em 48h

### Gerenciamento de clientes
- Reconectar WhatsApp (novo QR code)
- Editar configuracao do bot
- Pausar/ativar cliente
- Deletar cliente (cleanup automatico: Evolution + Chatwoot + banco)
- Historico de acoes (audit log)

## Workflow n8n — Fluxo Principal Receptivo

O workflow (`fluxos-ref/[ChatSales] Fluxo Principal Receptivo.json`) e o coracao do sistema. 132 nos que processam mensagens recebidas:

```
Webhook (Chatwoot)
  ↓
Filtra evento valido (message_created, incoming)
  ↓
Busca Config WhatsApp (panel_whatsapp_config) → identifica cliente por account_id
  ↓
Busca Bot Config (panel_bot_config) → prompt, tom, servicos, horarios
  ↓
Busca Google Config (panel_google_config) → calendar_id, tokens
  ↓
Edit Fields → normaliza payload Chatwoot (flat) pro formato esperado
  ↓
Busca/Cria Contato + Conversa no Supabase
  ↓
Buffer Rules (agrega msgs antes de processar)
  ↓
AI Agent (GPT-4o + Structured Output Parser)
  ↓ retorna JSON: { reply, status_next, labels_next, handoff, actions, debug }
  ↓
Parser Agente 01 → valida/normaliza JSON
  ↓
Switch6 → roteia por appointment_status
  ↓
Roteia Acoes de Agenda → check/create/update ou no_agenda
  ↓
Edit Fields3/4 → prepara reply
  ↓
Enviar texto (Evolution API) → mensagem pro WhatsApp do paciente
```

### Formato do output do AI Agent

O Structured Output Parser forca o AI a retornar JSON com este schema:

```json
{
  "reply": "Ola! Como posso ajudar?",
  "status_next": "pending",
  "labels_next": ["etapa_triagem"],
  "handoff": { "needs_human": false, "reason": "" },
  "actions": {
    "agenda_check": { "should_check": false, "time_window_hint": null },
    "agenda_create": { "should_create": false, "start_iso": null, "end_iso": null, "title": null }
  },
  "debug": { "detected_intent": "triagem", "stage_current": null, "notes": null }
}
```

### Decisoes tecnicas do workflow

- **Payload Chatwoot e flat**: `body.sender.*`, `body.content`, `body.message_type` — o Edit Fields normaliza pro formato `body.conversation.messages[0].*` que os nos downstream esperam
- **Referencia ao webhook**: nos apos o Edit Fields usam `$('Edit Fields').item.json.*` (nao `$json.*` nem `$('Webhook').*`), porque `$json` muda de contexto ao longo do fluxo
- **Conta Chatwoot isolada**: cada cliente tem `chatwoot_account_id` proprio; o webhook do Chatwoot envia `body.account.id` que identifica o tenant
- **Sem Google Calendar**: o bot funciona sem Google Calendar configurado — as expressoes usam null-safety (`|| {}`, try/catch)
- **Modelo OpenAI**: gpt-4o (typeVersion 1.2, sem `builtInTools`) — estavel e comprovado

## Setup local

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd painel-admin
npm install

# 2. Configurar variaveis de ambiente
cp .env.example .env.local
# Preencher as credenciais no .env.local

# 3. Rodar
npm run dev
```

Acesse `http://localhost:3000`

## Variaveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variavel | Descricao |
|----------|-----------|
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | API key da Evolution |
| `CHATWOOT_URL` | URL do Chatwoot |
| `CHATWOOT_API_TOKEN` | Token de acesso do Chatwoot (Account 1) |
| `CHATWOOT_ACCOUNT_ID` | ID da Account principal (default: 1) |
| `CHATWOOT_BOT_EMAIL_DOMAIN` | Dominio para email fallback do bot |
| `CHATWOOT_BOT_PASSWORD` | Senha do usuario bot no Chatwoot |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase (Kong) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anonima do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role do Supabase |
| `N8N_URL` | URL do n8n |
| `GOOGLE_CLIENT_ID` | OAuth Client ID (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |

> Segurança de deploy: não versione credenciais reais no repositório e não injete segredos como build args de imagem.
> Em provedores como EasyPanel, configure segredos em variáveis de ambiente de runtime/serviço.

## Banco de dados

Migrations em `supabase/migrations/`:

| Migration | Descricao |
|-----------|-----------|
| `001_panel_tables.sql` | Cria todas as tabelas panel_* com RLS basico |
| `002_panel_rls.sql` | Policies de RLS para admins autenticados |
| `003_panel_chatwoot_account.sql` | Adiciona `chatwoot_account_id` e `chatwoot_agent_token` na panel_whatsapp_config |

### Tabelas do painel (prefixo panel_)

- **panel_clients** — registro central do cliente (nome, email, status)
- **panel_whatsapp_config** — config WhatsApp (instancia Evolution, Account Chatwoot, inbox, tokens)
- **panel_google_config** — tokens OAuth do Google Calendar
- **panel_bot_config** — configuracao completa do bot (perfil, servicos, horarios, tom, mensagens, handoff)
- **panel_onboarding_sessions** — sessoes de onboarding com token publico
- **panel_health_checks** — log de health checks
- **panel_audit_log** — log de acoes administrativas

### Tabelas existentes (do n8n — NAO modificar)

- **contacts**, **conversations**, **messages** — dados de conversas
- **appointments** — agendamentos no Google Calendar
- **ai_pauses** — trava contra respostas duplicadas
- **followup_logs** — logs do pipeline de follow-up

## Fluxo de criacao de instancia WhatsApp

Quando o admin cria uma instancia pelo painel (`POST /api/whatsapp/instances`):

1. Cria Account isolada no Chatwoot (email real do cliente, fallback pra email gerado)
2. Configura webhook Chatwoot → n8n na nova Account
3. Cria instancia na Evolution API apontando pra Account do cliente
4. Garante integracao Chatwoot ativa (`setChatwootIntegration`)
5. Aguarda inbox ser criada automaticamente (polling ate 5 tentativas)
6. Salva config completa no banco (`panel_whatsapp_config`)
7. Atualiza status do cliente pra `pending_whatsapp`
8. Registra audit log

Na **delecao**, o processo inverso: deleta instancia Evolution → deleta Account Chatwoot → deleta do banco.

## Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/login/              # Login (Supabase Auth)
│   ├── (dashboard)/               # Dashboard, clientes, settings
│   │   ├── clients/[id]/          # Detalhe do cliente
│   │   └── clients/new/           # Wizard de onboarding
│   ├── api/
│   │   ├── clients/[id]/          # CRUD de clientes (GET, PATCH, DELETE)
│   │   ├── whatsapp/instances/    # Criar instancia WhatsApp
│   │   └── ...                    # Google OAuth, health checks, etc
│   └── connect/[instance]/        # Pagina publica de onboarding
├── components/
│   ├── bot-config/                # Formulario de config do bot (secoes)
│   ├── client-detail/             # Componentes do detalhe do cliente
│   ├── dashboard/                 # Cards, tabela, health indicator
│   ├── layout/                    # Sidebar, header, mobile nav
│   ├── onboarding/                # Wizard de onboarding (5 etapas)
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── api/
│   │   ├── chatwoot.ts            # Wrapper Chatwoot (accounts isoladas, webhooks, inboxes)
│   │   ├── evolution.ts           # Wrapper Evolution API (instancias, QR, webhooks)
│   │   └── google.ts              # Google OAuth + Calendar
│   ├── db/                        # Helpers Supabase (clients, whatsapp-config, audit-log)
│   ├── supabase/                  # Clientes Supabase (server, client, admin)
│   └── validations/               # Schemas Zod
├── types/
│   ├── api.ts                     # Tipos das APIs externas
│   └── database.ts                # Tipos das tabelas Supabase
└── fluxos-ref/
    └── [ChatSales] Fluxo Principal Receptivo.json  # Workflow n8n (importar no n8n)
```

## Comandos

```bash
npm run dev    # Dev server (porta 3000)
npm run build  # Build de producao
npm run lint   # ESLint
```

## Deploy

Deploy via **EasyPanel** (projeto chatsales, servico "admin"):
- Build: Nixpacks (detecta Next.js automaticamente)
- Variaveis de ambiente configuradas no EasyPanel
- Servidor: srv1084294
