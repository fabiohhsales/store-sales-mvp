# Checklist de Execução — Follow-up V2

**Projeto:** Reestruturação de Follow-ups e Observabilidade  
**Início previsto:** 2026-05-08  
**Owner:** Dev ChatSales  

---

## 📅 Fase 0: Diagnóstico (Dias 1-3)

### Dia 1: Mapeamento

**Manhã:**
- [ ] Ler roadmap completo
- [ ] Setup ambiente de desenvolvimento
- [ ] Criar branch `feat/followup-v2`
- [ ] Buscar todos os arquivos com `followup` no código
- [ ] Criar `FOLLOWUP_AUDIT_SEND_POINTS.md`

**Tarde:**
- [ ] Mapear pontos de skip
- [ ] Criar `FOLLOWUP_AUDIT_SKIP_POINTS.md`
- [ ] Listar todos os reason codes existentes
- [ ] Criar tabela de reason codes

**Entrega do dia:** 2 arquivos de auditoria + tabela de codes

---

### Dia 2: Análise de Dados

**Manhã:**
- [ ] Conectar ao Supabase
- [ ] Rodar queries de contagem em `followup_cadence_steps`
- [ ] Rodar queries de contagem em `followup_logs`
- [ ] Rodar queries de alertas não resolvidos
- [ ] Criar `FOLLOWUP_AUDIT_DATA.md`

**Tarde:**
- [ ] Escrever query SQL de conversas candidatas
- [ ] Testar query e validar resultados
- [ ] Buscar duplicações (query com HAVING COUNT > 1)
- [ ] Documentar findings

**Entrega do dia:** `FOLLOWUP_AUDIT_DATA.md` + query validada

---

### Dia 3: Validação e Baseline

**Manhã:**
- [ ] Investigar cron job atual
- [ ] Documentar frequência, timeout, retry
- [ ] Criar `FOLLOWUP_CRON_AUDIT.md`
- [ ] Testar validação de horários manualmente

**Tarde:**
- [ ] Capturar baseline de métricas (SQL queries)
- [ ] Criar `FOLLOWUP_BASELINE.md` com números atuais
- [ ] Compilar todos os documentos de auditoria
- [ ] Review com CTO: apresentar findings

**Entrega do dia:** Auditoria completa + apresentação de findings

---

## 📅 Fase 1: Estado e Eventos (Dias 4-10)

### Dia 4: Migrations

**Manhã:**
- [ ] Criar `044_conversation_followup_state.sql`
- [ ] Testar migration em ambiente local
- [ ] Criar índices necessários
- [ ] Escrever testes de insert/update

**Tarde:**
- [ ] Criar `045_followup_events.sql`
- [ ] Testar migration em ambiente local
- [ ] Validar constraints e índices
- [ ] Commit migrations

**Entrega do dia:** 2 migrations testadas e commitadas

---

### Dia 5: Helpers de Estado

**Manhã:**
- [ ] Criar `src/lib/followup/state.ts`
- [ ] Implementar `getConversationFollowupState()`
- [ ] Implementar `upsertConversationFollowupState()`
- [ ] Implementar `transitionFollowupState()`

**Tarde:**
- [ ] Adicionar tipos em `src/types/followup.ts`
- [ ] Criar `tests/followup-state.test.ts`
- [ ] Rodar testes
- [ ] Commit código

**Entrega do dia:** `state.ts` com testes passando

---

### Dia 6: Helpers de Eventos

**Manhã:**
- [ ] Criar `src/lib/followup/events.ts`
- [ ] Implementar `recordFollowupEvent()`
- [ ] Implementar `listConversationFollowupEvents()`
- [ ] Implementar `buildDisplayText()`

**Tarde:**
- [ ] Adicionar tipos de eventos em `src/types/followup.ts`
- [ ] Criar `tests/followup-events.test.ts`
- [ ] Rodar testes
- [ ] Commit código

**Entrega do dia:** `events.ts` com testes passando

---

### Dia 7: Wrapper de Envio

**Manhã:**
- [ ] Criar `src/lib/followup/send-wrapper.ts`
- [ ] Implementar `sendFollowupMessageWithTracking()`
- [ ] Integrar com `recordFollowupEvent()`
- [ ] Integrar com `upsertConversationFollowupState()`

**Tarde:**
- [ ] Testar envio real em ambiente de dev
- [ ] Validar que eventos são criados
- [ ] Validar que estado é atualizado
- [ ] Commit código

**Entrega do dia:** Wrapper funcional com tracking completo

---

### Dia 8: API de Eventos

**Manhã:**
- [ ] Criar `src/app/api/followups/[conversationId]/events/route.ts`
- [ ] Implementar GET handler
- [ ] Adicionar autenticação com `resolveDeskUser`
- [ ] Testar endpoint com curl

**Tarde:**
- [ ] Criar componente `FollowupEventCard.tsx`
- [ ] Estilizar card de evento
- [ ] Testar renderização isolada
- [ ] Commit código

**Entrega do dia:** API + componente de evento

---

### Dia 9: Timeline no Desk

**Manhã:**
- [ ] Modificar `src/components/desk/chat-view.tsx`
- [ ] Integrar busca de eventos
- [ ] Intercalar eventos na timeline
- [ ] Testar renderização

**Tarde:**
- [ ] Ajustes de estilo (cores, espaçamento)
- [ ] Adicionar loading states
- [ ] Testar em conversa real
- [ ] Commit código

**Entrega do dia:** Timeline do Desk mostrando eventos

---

### Dia 10: Testes e Docs

**Manhã:**
- [ ] Criar `tests/followup-events.test.ts` completo
- [ ] Rodar todos os testes da Fase 1
- [ ] Corrigir falhas
- [ ] Validar cobertura > 80%

**Tarde:**
- [ ] Atualizar `CLAUDE.md` com novas tabelas
- [ ] Criar PR: "feat: followup state and events"
- [ ] Code review com time
- [ ] Merge se aprovado

**Entrega do dia:** Fase 1 completa e mergeada

---

## 📅 Fase 2: Motor de Decisão (Dias 11-24)

### Dia 11: Estrutura do Motor

**Manhã:**
- [ ] Criar `src/lib/followup/evaluator.ts`
- [ ] Implementar estrutura base de `evaluateFollowupDecision()`
- [ ] Implementar `checkPreflight()`
- [ ] Implementar `checkConversationStatus()`

**Tarde:**
- [ ] Adicionar tipos `FollowupDecisionInput` e `FollowupDecision`
- [ ] Criar testes básicos
- [ ] Commit código

**Entrega do dia:** Estrutura do motor criada

---

### Dia 12: Análise de Última Mensagem

**Manhã:**
- [ ] Implementar `analyzeLastMessage()`
- [ ] Adicionar lógica de "lead respondeu recentemente"
- [ ] Escrever testes unitários

**Tarde:**
- [ ] Implementar `determineCadenceType()`
- [ ] Testar lógica de prioridade de cadências
- [ ] Commit código

**Entrega do dia:** Análise de última mensagem funcionando

---

### Dia 13: Seleção de Steps

**Manhã:**
- [ ] Implementar `findNextEligibleStep()`
- [ ] Buscar `lead_followup_steps` do `panel_bot_config`
- [ ] Filtrar steps já enviados
- [ ] Validar janela de tempo

**Tarde:**
- [ ] Implementar `checkWorkingHours()`
- [ ] Implementar `renderMessage()`
- [ ] Escrever testes
- [ ] Commit código

**Entrega do dia:** Seleção de steps funcionando

---

### Dia 14: Orquestrador

**Manhã:**
- [ ] Criar `src/lib/followup/orchestrator.ts`
- [ ] Implementar `executeFollowupOrchestration()`
- [ ] Implementar `executeSendNow()`
- [ ] Implementar `executeSchedule()`

**Tarde:**
- [ ] Integrar com motor de decisão
- [ ] Integrar com eventos e estado
- [ ] Testar fluxo completo end-to-end
- [ ] Commit código

**Entrega do dia:** Orquestrador funcional

---

### Dia 15: Matriz de Elegibilidade

**Manhã:**
- [ ] Criar `FOLLOWUP_DECISION_MATRIX.md`
- [ ] Documentar todas as regras de preflight
- [ ] Documentar análise de última mensagem
- [ ] Documentar seleção de cadência e step

**Tarde:**
- [ ] Criar `FOLLOWUP_REASON_CODES.md`
- [ ] Catalogar todos os reason codes
- [ ] Adicionar labels e descrições
- [ ] Commit documentos

**Entrega do dia:** Documentação completa de decisões

---

### Dia 16-18: Migração das Cadências

**Dia 16:**
- [ ] Migrar cadência de lead para usar motor
- [ ] Criar função `buildFollowupInput()`
- [ ] Testar com dados reais
- [ ] Commit código

**Dia 17:**
- [ ] Migrar cadência de atendimento
- [ ] Testar com dados reais
- [ ] Commit código

**Dia 18:**
- [ ] Migrar cadência de agendado
- [ ] Testar com dados reais
- [ ] Commit código

**Entrega:** Todas as cadências usando motor centralizado

---

### Dia 19: Endpoint de Diagnóstico

**Manhã:**
- [ ] Criar `src/app/api/followups/diagnose/route.ts`
- [ ] Implementar POST handler
- [ ] Testar com Postman/curl

**Tarde:**
- [ ] Criar modal de diagnóstico no Desk (opcional)
- [ ] Integrar botão no Desk
- [ ] Testar UX
- [ ] Commit código

**Entrega do dia:** Diagnóstico manual funcional

---

### Dia 20-23: Testes de Integração

**Dia 20-21:**
- [ ] Criar `tests/followup-orchestrator.integration.test.ts`
- [ ] Testar cenário: WhatsApp desconectado
- [ ] Testar cenário: fora do horário
- [ ] Testar cenário: step elegível
- [ ] Testar cenário: conversa resolvida

**Dia 22:**
- [ ] Testar regressão: cadências antigas ainda funcionam?
- [ ] Benchmark performance (antes vs. depois)
- [ ] Validar que não há duplicações

**Dia 23:**
- [ ] Corrigir bugs encontrados
- [ ] Rodar todos os testes
- [ ] Validar cobertura > 80%

**Entrega:** Testes passando, sem regressão

---

### Dia 24: Review e Merge

**Manhã:**
- [ ] Atualizar `CLAUDE.md` com motor de decisão
- [ ] Criar PR: "feat: centralized followup decision engine"
- [ ] Code review com CTO

**Tarde:**
- [ ] Ajustes do review
- [ ] Merge se aprovado
- [ ] Deploy em staging

**Entrega do dia:** Fase 2 completa e mergeada

---

## 📅 Fase 3: UI de Visibilidade (Dias 25-38)

### Dia 25-26: Card de Follow-up no Desk

**Dia 25:**
- [ ] Criar `FollowupStatusCard.tsx`
- [ ] Implementar estados visuais (cores, ícones)
- [ ] Implementar casos: scheduled, active, blocked

**Dia 26:**
- [ ] Adicionar ações: enviar agora, reagendar, cancelar
- [ ] Integrar no sidebar do Desk
- [ ] Testar com dados reais
- [ ] Commit código

**Entrega:** Card visível e funcional no Desk

---

### Dia 27-28: Badges no Kanban

**Dia 27:**
- [ ] Modificar `conversation-card.tsx`
- [ ] Adicionar busca de estado de follow-up
- [ ] Criar função `getFollowupBadge()`

**Dia 28:**
- [ ] Renderizar badges no card
- [ ] Ajustes de estilo
- [ ] Testar no Kanban real
- [ ] Commit código

**Entrega:** Badges aparecendo no Kanban

---

### Dia 29-32: Central de Follow-ups Remodelada

**Dia 29:**
- [ ] Criar `src/app/(dashboard)/followups-v2/page.tsx`
- [ ] Implementar tabs (Programados, Ativo, Elegíveis, etc.)
- [ ] Estrutura básica

**Dia 30:**
- [ ] Criar `FollowupsTable.tsx`
- [ ] Implementar colunas: contato, cadência, step, quando, motivo
- [ ] Adicionar loading states

**Dia 31:**
- [ ] Criar API `GET /api/followups/list`
- [ ] Implementar filtros por estado
- [ ] Testar endpoint

**Dia 32:**
- [ ] Integrar tabela com API
- [ ] Adicionar ações: abrir, enviar, cancelar
- [ ] Testar com dados reais
- [ ] Commit código

**Entrega:** Central de Follow-ups com abas funcionais

---

### Dia 33-34: Filtros Avançados

**Dia 33:**
- [ ] Adicionar filtros: cadência, step, responsável, etapa
- [ ] Implementar lógica de filtragem na API
- [ ] Testar queries

**Dia 34:**
- [ ] UI de filtros (dropdowns, inputs)
- [ ] Integrar com tabela
- [ ] Testar UX
- [ ] Commit código

**Entrega:** Filtros funcionais

---

### Dia 35-36: Dashboard de Métricas

**Dia 35:**
- [ ] Criar cards de métricas: total programados, taxa de resposta, etc.
- [ ] Criar API `GET /api/followups/dashboard`
- [ ] Implementar queries de agregação

**Dia 36:**
- [ ] Integrar cards com API
- [ ] Adicionar refresh automático
- [ ] Ajustes de estilo
- [ ] Commit código

**Entrega:** Dashboard com métricas em tempo real

---

### Dia 37-38: Testes E2E e Review

**Dia 37:**
- [ ] Criar testes E2E com Playwright/Cypress
- [ ] Testar fluxo: abrir Central → filtrar → ação
- [ ] Testar fluxo: abrir Desk → ver card → enviar agora

**Dia 38:**
- [ ] Corrigir bugs encontrados
- [ ] Atualizar documentação
- [ ] Criar PR: "feat: followup visibility UI"
- [ ] Code review e merge

**Entrega:** Fase 3 completa

---

## 📅 Fase 4: Retomada Humano Parado (Dias 39-48)

### Dia 39: Configurações

**Manhã:**
- [ ] Criar migration `046_human_retake_config.sql`
- [ ] Adicionar colunas em `panel_bot_config`
- [ ] Testar migration

**Tarde:**
- [ ] Adicionar seção de config na UI
- [ ] Campos: threshold, action_mode, tags excluídas
- [ ] Commit código

**Entrega:** Configurações de retomada criadas

---

### Dia 40-41: Detector de Estagnação

**Dia 40:**
- [ ] Criar `src/lib/followup/human-retake.ts`
- [ ] Implementar `findHumanStagnatedConversations()`
- [ ] Criar RPC no Supabase (se necessário)

**Dia 41:**
- [ ] Implementar `evaluateHumanRetake()`
- [ ] Integrar com análise de contexto
- [ ] Testar com dados mock
- [ ] Commit código

**Entrega:** Detector funcional

---

### Dia 42-43: Avaliador de Contexto (IA)

**Dia 42:**
- [ ] Criar `src/lib/followup/context-analyzer.ts`
- [ ] Implementar `analyzeConversationContext()`
- [ ] Integrar com OpenAI

**Dia 43:**
- [ ] Implementar `generateRetakeSuggestion()`
- [ ] Testar geração de mensagens
- [ ] Ajustar prompts
- [ ] Commit código

**Entrega:** Análise de contexto funcionando

---

### Dia 44: Integração no Motor

**Manhã:**
- [ ] Modificar `evaluator.ts`
- [ ] Adicionar `checkHumanStagnation()`
- [ ] Integrar antes do block em `in_service`

**Tarde:**
- [ ] Testar fluxo completo
- [ ] Validar eventos sendo criados
- [ ] Commit código

**Entrega:** Motor detectando estagnação

---

### Dia 45: Cron Job

**Manhã:**
- [ ] Criar `src/app/api/cron/human-retake/route.ts`
- [ ] Implementar POST handler
- [ ] Buscar clientes com retomada ativada

**Tarde:**
- [ ] Processar conversas estagnadas
- [ ] Testar execução manual
- [ ] Adicionar ao agendamento do EasyPanel
- [ ] Commit código

**Entrega:** Cron rodando

---

### Dia 46-47: UI

**Dia 46:**
- [ ] Adicionar aba "Humano parado" na Central
- [ ] Criar `StagnatedConversationsTable.tsx`
- [ ] Criar API `GET /api/followups/stagnated`

**Dia 47:**
- [ ] Modificar `FollowupStatusCard.tsx` para retomada sugerida
- [ ] Adicionar ações: aprovar, editar, ignorar
- [ ] Testar UX completo
- [ ] Commit código

**Entrega:** UI de retomada funcional

---

### Dia 48: Testes e Review

**Manhã:**
- [ ] Criar `tests/human-retake.integration.test.ts`
- [ ] Testar cenários: max attempts, has appointment

**Tarde:**
- [ ] Atualizar documentação
- [ ] Criar PR: "feat: human stagnation retake"
- [ ] Code review e merge

**Entrega:** Fase 4 completa

---

## 📅 Fase 5: IA Contextual (Dias 49-62)

### Dia 49-50: Análise de Sentimento Refinada

**Dia 49:**
- [ ] Estender `context-analyzer.ts`
- [ ] Implementar `analyzeRefinedSentiment()`
- [ ] Adicionar tipos: urgency, satisfaction, emotions

**Dia 50:**
- [ ] Testar análise com conversas reais
- [ ] Ajustar prompts
- [ ] Commit código

**Entrega:** Análise refinada funcionando

---

### Dia 51-52: Personalização de Mensagens

**Dia 51:**
- [ ] Criar `src/lib/followup/message-generator.ts`
- [ ] Implementar `generateContextualFollowupMessage()`
- [ ] Integrar com análise de contexto

**Dia 52:**
- [ ] Testar geração de mensagens variadas
- [ ] Ajustar prompts e temperatura
- [ ] Integrar no motor de decisão
- [ ] Commit código

**Entrega:** Mensagens contextuais geradas

---

### Dia 53: Heurísticas de Timing

**Manhã:**
- [ ] Criar `src/lib/followup/timing.ts`
- [ ] Implementar `calculateOptimalSendTime()`
- [ ] Adicionar regras: evitar domingo, late night, peak hours

**Tarde:**
- [ ] Integrar no motor de decisão
- [ ] Testar com diferentes horários
- [ ] Commit código

**Entrega:** Timing otimizado

---

### Dia 54-55: Feedback Loop

**Dia 54:**
- [ ] Criar migration para `response_received` em `followup_cadence_steps`
- [ ] Criar trigger para auto-update quando lead responde

**Dia 55:**
- [ ] Testar trigger com mensagens reais
- [ ] Validar cálculo de `time_to_response_seconds`
- [ ] Commit código

**Entrega:** Feedback loop funcionando

---

### Dia 56-57: Dashboard de Performance

**Dia 56:**
- [ ] Criar página `followups-v2/analytics/page.tsx`
- [ ] Criar API `GET /api/followups/analytics`
- [ ] Implementar queries: taxa de resposta, tempo médio

**Dia 57:**
- [ ] Criar cards de métricas
- [ ] Adicionar gráficos (opcional)
- [ ] Testar com dados reais
- [ ] Commit código

**Entrega:** Dashboard de performance

---

### Dia 58-59: A/B Testing

**Dia 58:**
- [ ] Criar migration `047_followup_ab_tests.sql`
- [ ] Adicionar colunas em `followup_cadence_steps`

**Dia 59:**
- [ ] Implementar `selectABTestVariant()` em `message-generator.ts`
- [ ] Testar lógica de split 50/50
- [ ] UI para criar A/B tests (opcional)
- [ ] Commit código

**Entrega:** A/B testing funcional

---

### Dia 60: Alertas Inteligentes

**Manhã:**
- [ ] Criar `src/lib/followup/alerts.ts`
- [ ] Implementar `triggerFollowupAlert()`
- [ ] Integrar com motor de decisão

**Tarde:**
- [ ] Testar notificações (toast, browser notification)
- [ ] Ajustar thresholds
- [ ] Commit código

**Entrega:** Alertas funcionando

---

### Dia 61: Documentação

**Manhã:**
- [ ] Criar `docs/FOLLOWUP_OPERATOR_GUIDE.md`
- [ ] Escrever seções: estados, central, diagnóstico, FAQ

**Tarde:**
- [ ] Criar vídeo tutorial (opcional)
- [ ] Revisar documentação com time de suporte
- [ ] Commit docs

**Entrega:** Documentação completa

---

### Dia 62: Review Final

**Manhã:**
- [ ] Rodar todos os testes (unit + integration + E2E)
- [ ] Corrigir últimos bugs

**Tarde:**
- [ ] Atualizar `CLAUDE.md` com tudo da Fase 5
- [ ] Criar PR final: "feat: AI contextual followup"
- [ ] Code review e merge

**Entrega:** Fase 5 completa, projeto concluído 🎉

---

## 📊 Tracking de Progresso

### Por Fase

| Fase | Status | Dias | Checklist |
|---|---|---|---|
| Fase 0 | ⬜ | 1-3 | [ ] Diagnóstico |
| Fase 1 | ⬜ | 4-10 | [ ] Estado e Eventos |
| Fase 2 | ⬜ | 11-24 | [ ] Motor de Decisão |
| Fase 3 | ⬜ | 25-38 | [ ] UI de Visibilidade |
| Fase 4 | ⬜ | 39-48 | [ ] Retomada Humano |
| Fase 5 | ⬜ | 49-62 | [ ] IA Contextual |

### Métricas de Execução

- **Dias trabalhados:** 0 / 62
- **PRs mergeados:** 0 / 6
- **Testes criados:** 0 / ~20
- **Cobertura atual:** ? / 80%

---

## 🚨 Bloqueios e Ajuda

### Se você ficar bloqueado:

1. **Dúvida técnica?** → Consultar [ROADMAP_FOLLOWUP_V2.md](./ROADMAP_FOLLOWUP_V2.md) para specs detalhadas
2. **Decisão de arquitetura?** → Consultar CTO ou criar issue no GitHub
3. **Bug inesperado?** → Criar ticket, documentar, continuar em outra tarefa
4. **Teste falhando?** → Debugar, se > 1h bloqueado, pedir ajuda

### Daily Stand-up (opcional)

- O que fiz ontem?
- O que vou fazer hoje?
- Bloqueios?

---

## ✅ Checklist de Qualidade

Antes de criar cada PR, validar:

- [ ] Todos os testes passando
- [ ] Cobertura > 80%
- [ ] Nenhum console.log esquecido
- [ ] Nenhum TODO crítico pendente
- [ ] Documentação atualizada
- [ ] Migration testada localmente
- [ ] Code review solicitado

---

**Bom trabalho! 🚀**
