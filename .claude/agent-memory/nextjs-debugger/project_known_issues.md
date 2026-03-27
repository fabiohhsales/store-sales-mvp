---
name: Known Issues
description: Bugs e inconsistências confirmados na revisão completa do código em 2026-03-27
type: project
---

Bugs e issues encontrados na revisão completa de 2026-03-27:

**Críticos:**
- `ai_pause` NÃO é limpo quando `runAgent()` retorna o `fallbackOutput` por erro na chamada OpenAI (catch em agent.ts linha 122). O `clearAiPause` só é chamado no `dispatch()`, mas se `runAgent()` lançar antes de `setAiPause()`, tudo bem — porém se travar DEPOIS do `setAiPause()` com uma exceção não capturada que borbulha para `runPipeline()`, o `dispatch()` nunca é chamado e o `ai_pause` fica permanentemente ativo. ATUALIZAÇÃO: o try/catch interno em agent.ts captura erros da OpenAI e retorna fallbackOutput — mas o `fallbackOutput` tem `reply: null`, então dispatch() é chamado e limpa o pause. O REAL problema é que o fallbackOutput não aciona uma resposta de erro para o paciente.
- Middleware NÃO whitelist `/api/auth/google/public` e `/api/auth/google/callback` — apenas `/api/auth/callback` está na lista. Isso quebra o fluxo OAuth público do onboarding.
- `AI_MODEL` default em `client.ts` é `gpt-4o` (linha 21), mas CLAUDE.md documenta `gpt-4o-mini` como padrão. Sem `OPENAI_MODEL` setada, o modelo mais caro é usado.
- `CRON_SECRET` não setado significa que GET `/api/cron/confirmacoes` fica 100% público sem auth — qualquer um pode disparar o pipeline de follow-up.
- `calendar-agent.ts` usa `GOOGLE_REFRESH_TOKEN` (conta central Sales Tec) mas `panel_google_config` por cliente existe na DB — a arquitetura de Google Calendar foi simplificada para conta central mas o CLAUDE.md menciona OAuth por cliente.

**Avisos:**
- `saveMessage()` em pipeline.ts não trata duplicate key (23505) — se o mesmo webhook chegar duas vezes antes do ai_pause ser setado, haverá dois inserts de mensagem.
- `upsertConversation()` não tem tratamento de erro 23505 como `upsertContact()` tem.
- `history/route.ts` não tem autenticação — qualquer request DELETE sem auth pode apagar histórico de qualquer cliente.
- `slots.ts` linha 197: `roundUpToStep` não respeita `min_advance_booking_hours` — verifica só `slotStart < new Date()` sem considerar a margem mínima do botConfig.
- SOC route usa module-level `let cache` e `inflightCheck` — funciona no EasyPanel (Node.js persistente) mas é frágil em ambientes serverless.
- `followup_logs` table referenciada em `confirmations.ts` mas não documentada no CLAUDE.md.

**Why:** Encontrados na revisão de 2026-03-27.
**How to apply:** Priorizar correção do middleware (OAuth quebrado), default de modelo e auth no history endpoint.
