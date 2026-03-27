---
name: Architecture Decisions
description: Decisões arquiteturais críticas confirmadas no código real (não apenas documentação)
type: project
---

Decisões arquiteturais confirmadas na revisão de 2026-03-27:

**Google Calendar — Conta Central (não por cliente):**
`src/lib/calendar/client.ts` usa `GOOGLE_REFRESH_TOKEN` env var global. `panel_google_config` por cliente existe na DB e `calendarId` é lido de lá, mas a autenticação OAuth é da conta central Sales Tec. O fluxo OAuth por cliente em `/api/auth/google/` existe mas a conta central é o que o bot engine usa.

**ai_pause lifecycle confirmado:**
- Setado em `agent.ts:setAiPause()` ANTES da chamada OpenAI
- Limpo em `dispatcher.ts` no bloco `finally` — garante limpeza mesmo com erros
- Retorno `fallbackOutput` do catch em agent.ts ainda chega no dispatch, que limpa o pause

**Multi-tenant via chatwoot_account_id:**
`pipeline.ts:resolveClientContext()` faz lookup em `panel_whatsapp_config.chatwoot_account_id` para identificar o cliente. Status do cliente é verificado em `panel_clients.status` — deve ser `'active'` para processar.

**Modelo AI real:**
`AI_MODEL` em `src/lib/ai/client.ts` linha 21 default é `gpt-4o` (NÃO `gpt-4o-mini` como diz CLAUDE.md). Requer `OPENAI_MODEL=gpt-4o-mini` explícito no env.

**Zod v4:**
`output-schema.ts` usa `import { z } from 'zod/v4'` — confirma que o projeto usa Zod v4 (novo caminho de import).

**Cron de follow-up:**
`/api/cron/confirmacoes` com `POST` protegido por `CRON_SECRET` via Bearer header. `GET` também funciona (para teste manual) — se `CRON_SECRET` não estiver setado, sem proteção alguma.

**SOC (Centro de Operações):**
Cache em memória com module-level vars em `src/app/api/soc/route.ts`. TTL=25s. Funciona porque EasyPanel é Node.js persistente.
