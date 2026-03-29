# Painel Admin ChatSales — Copilot Instructions

> Full architecture, tables, API references, env vars, and URLs: **[CLAUDE.md](../CLAUDE.md)**
> Custom agents for this project: **[.github/agents/](./agents/)**

## O que é este projeto

Painel administrativo multi-tenant Next.js 16 que orquestra bots de WhatsApp com IA para profissionais de saúde. Cada cliente tem sua própria Chatwoot Account isolada. O bot engine roda nativamente em Next.js (`src/lib/bot/`) — o n8n foi descontinuado.

## Build e comandos

```bash
npm run dev      # Dev server
npm run build    # Build (NODE_OPTIONS='--max-old-space-size=1536')
npm run lint     # ESLint
```

`typescript.ignoreBuildErrors: true` — erros de tipo não quebram o build. Corrija localmente, não confie no build para validar tipos.

## Convenções de código

- **Server Components por padrão.** Use `"use client"` somente quando necessário (event handlers, hooks, estado)
- **Validação**: Zod em toda API route e form
- **Feedback**: `sonner` toast + loading state em toda operação assíncrona
- **Tabelas do painel**: prefixo `panel_` (ex: `panel_clients`, `panel_bot_config`)
- **Commits**: português, imperativo, < 72 chars (ex: `adiciona endpoint de pausa em lote`)

## Gotchas críticos — leia antes de qualquer mudança

| Gotcha | Regra |
|---|---|
| `createAiClient()` | Chamar DENTRO das funções — **nunca no module level** (quebra o build) |
| `NEXT_PUBLIC_*` vars | Precisam estar no `nixpacks.toml` além do EasyPanel (build time) |
| Webhook público | `/api/webhooks/chatwoot` deve permanecer sem auth — está whitelistado no middleware |
| `ai_pause` | Só limpar no final do dispatch — é o mutex que evita processamento duplo |
| Chatwoot v4.9 | `message_type` é string `"incoming"` (não inteiro); `contact` vem em `payload.conversation.meta.sender` |
| Multi-tenant | O cliente é identificado por `payload.account.id` → `panel_whatsapp_config.chatwoot_account_id` |
| Bot silencioso | Se `panel_clients.status ≠ 'active'`, pipeline ignora a mensagem sem erro |

## Estrutura dos agentes

Use os agentes em `.github/agents/` para tarefas especializadas:

| Agente | Quando usar |
|---|---|
| `cto-chatsales` | Decisões de arquitetura, delegação |
| `dev-chatsales` | Implementação de features e correção de bugs |
| `devops-chatsales` | Deploy, EasyPanel, Nixpacks, variáveis de ambiente |
| `produto-chatsales` | Roadmap, UX, especificação de funcionalidades |
| `suporte-chatsales` | Diagnóstico de problemas de clientes |
| `review_code` | Review de código, busca de erros e validação com lint |
| `review_security` | Review de seguranca, autenticacao e exposicao de dados |
| `review_tests` | Review de estrategia de testes e cobertura pre-merge |
| `github_specialist` | Operacoes GitHub com MCP: PRs, issues, labels, releases e automacao |

## Hooks

- PreToolUse em `.github/hooks/review-guard.json` bloqueia comandos destrutivos em sessoes de review.
