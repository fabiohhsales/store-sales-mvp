# Painel Admin — Sales Tec

Painel administrativo para gerenciar o onboarding de clientes do chatbot de agendamento da Sales Tec.

## O que faz

- **Dashboard** com visao geral dos clientes e status dos servicos
- **Wizard de onboarding** pra criar novos clientes (dados, WhatsApp, Google Calendar, config do bot)
- **Link publico** (`/connect/[instancia]`) pra o cliente conectar WhatsApp e Google Calendar sem precisar de login
- **Gerenciamento completo** do cliente: editar config, pausar/ativar, reconectar servicos, apagar
- **Health check** em tempo real das instancias WhatsApp

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui
- **Supabase** (PostgreSQL + Auth)
- Integracao com **Evolution API** (WhatsApp), **Chatwoot**, **Google Calendar**

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
| `CHATWOOT_API_TOKEN` | Token de acesso do Chatwoot |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase (Kong) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anonima do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role do Supabase |
| `GOOGLE_CLIENT_ID` | OAuth Client ID (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |

## Banco de dados

As migrations estao em `supabase/migrations/`. Tabelas do painel usam prefixo `panel_`:

- `panel_clients` — clientes
- `panel_whatsapp_config` — config WhatsApp por cliente
- `panel_google_config` — tokens OAuth do Google Calendar
- `panel_bot_config` — configuracao completa do bot/IA
- `panel_health_checks` — log de health checks
- `panel_audit_log` — log de acoes administrativas

## Comandos

```bash
npm run dev    # Dev server (porta 3000)
npm run build  # Build de producao
npm run lint   # ESLint
```

## Estrutura

```
src/
├── app/
│   ├── (auth)/login/          # Pagina de login
│   ├── (dashboard)/           # Dashboard, clientes, settings
│   ├── api/                   # API routes (WhatsApp, Google OAuth, etc)
│   └── connect/               # Pagina publica de onboarding do cliente
├── components/
│   ├── bot-config/            # Secoes do formulario de config do bot
│   ├── client-detail/         # Componentes do detalhe do cliente
│   ├── dashboard/             # Cards, tabela, health indicator
│   ├── layout/                # Sidebar, header, mobile nav
│   ├── onboarding/            # Wizard de onboarding (5 etapas)
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── api/                   # Wrappers: Evolution, Chatwoot, Google
│   ├── db/                    # Helpers de query Supabase
│   ├── supabase/              # Clientes Supabase (server, client, admin)
│   └── validations/           # Schemas Zod
└── types/                     # Tipos TypeScript
```
