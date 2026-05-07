# Estratégia Git — Reestruturação de Follow-ups V2

**Projeto:** ChatSales Painel2  
**Feature:** Follow-up Observável com Retomada Inteligente  
**Data início:** 2026-05-07  
**Duração prevista:** 8 semanas (62 dias úteis)

---

## 🎯 Decisão Executiva

**NÃO fazer tudo em um commit gigante.**

**Estratégia: INCREMENTAL POR FASE**

### Por quê?

1. **Risco de regressão** — são mudanças críticas no motor de follow-up
2. **Code review humanamente impossível** em PRs com 10k+ linhas
3. **Deploy atômico muito arriscado** — rollback complexo
4. **Testing incremental** — valida cada fase antes de avançar
5. **Feedback do time** — permite ajustes entre fases
6. **Continuidade do negócio** — sistema continua funcionando durante desenvolvimento

---

## 📐 Estrutura de Branches

```text
main (produção estável)
  ↓
feat/followup-v2 (branch principal da feature)
  ↓
feat/followup-v2-phase-0 (branch efêmera para Fase 0)
feat/followup-v2-phase-1 (branch efêmera para Fase 1)
feat/followup-v2-phase-2 (branch efêmera para Fase 2)
feat/followup-v2-phase-3 (branch efêmera para Fase 3)
feat/followup-v2-phase-4 (branch efêmera para Fase 4)
feat/followup-v2-phase-5 (branch efêmera para Fase 5)
```

### Workflow detalhado

1. **Branch principal**: `feat/followup-v2` criada a partir de `main`
2. **Cada fase**: branch efêmera a partir de `feat/followup-v2`
3. **Merge**: fase → `feat/followup-v2` → staging → `main`

---

## 📦 Plano de PRs

### PR #1: Fase 0 — Diagnóstico e Baseline

**Branch:** `feat/followup-v2-phase-0`  
**Tamanho:** ~500 linhas (docs)  
**Duração:** 3 dias  
**Risco:** 🟢 Baixo (só documentação)

**Commits:**
1. `docs: adiciona auditoria de pontos de envio e skip`
2. `docs: adiciona análise de dados de follow-up`
3. `docs: adiciona baseline de métricas atuais`
4. `docs: adiciona validação de cron e horários`
5. `docs: compila auditoria completa de follow-up`

**Arquivos criados:**
- `docs/followup-v2/FOLLOWUP_AUDIT_SEND_POINTS.md`
- `docs/followup-v2/FOLLOWUP_AUDIT_SKIP_POINTS.md`
- `docs/followup-v2/FOLLOWUP_AUDIT_DATA.md`
- `docs/followup-v2/FOLLOWUP_CRON_AUDIT.md`
- `docs/followup-v2/FOLLOWUP_HOURS_VALIDATION.md`
- `docs/followup-v2/FOLLOWUP_BASELINE.md`

**Critério de merge:** Documentação completa e revisada

---

### PR #2: Fase 1 — Estado e Eventos

**Branch:** `feat/followup-v2-phase-1`  
**Tamanho:** ~2.000 linhas  
**Duração:** 7 dias  
**Risco:** 🟡 Médio (novas tabelas + pipeline changes)

**Commits:**
1. `feat: adiciona migration para conversation_followup_state`
2. `feat: adiciona migration para followup_events`
3. `feat: cria helpers de estado de follow-up`
4. `feat: cria helpers de eventos de follow-up`
5. `feat: cria wrapper de envio com tracking`
6. `feat: adiciona API de eventos de follow-up`
7. `feat: adiciona componente de evento na timeline`
8. `feat: integra eventos na timeline do Desk`
9. `test: adiciona testes de estado e eventos`
10. `docs: atualiza CLAUDE.md com novas tabelas`

**Arquivos criados:**
- `supabase/migrations/044_conversation_followup_state.sql`
- `supabase/migrations/045_followup_events.sql`
- `src/lib/followup/state.ts`
- `src/lib/followup/events.ts`
- `src/lib/followup/send-wrapper.ts`
- `src/app/api/followups/[conversationId]/events/route.ts`
- `src/components/desk/followup-event-card.tsx`
- `tests/followup-state.test.ts`
- `tests/followup-events.test.ts`

**Arquivos modificados:**
- `src/components/desk/chat-view.tsx` — integra timeline
- `src/lib/followup/shared.ts` — usa novo wrapper
- `CLAUDE.md` — documenta tabelas

**Critério de merge:**
- ✅ Migrations testadas em dev
- ✅ Timeline do Desk mostra eventos
- ✅ Cobertura de testes > 80%
- ✅ Code review aprovado

---

### PR #3: Fase 2 — Motor de Decisão

**Branch:** `feat/followup-v2-phase-2`  
**Tamanho:** ~3.500 linhas  
**Duração:** 14 dias  
**Risco:** 🔴 Alto (lógica central do sistema)

**Commits:**
1. `feat: cria estrutura do motor de decisão`
2. `feat: implementa análise de última mensagem`
3. `feat: implementa seleção de cadência e steps`
4. `feat: cria orquestrador de execução`
5. `feat: documenta matriz de elegibilidade`
6. `feat: documenta catálogo de reason codes`
7. `refactor: migra cadência de lead para motor central`
8. `refactor: migra cadência de atendimento para motor central`
9. `refactor: migra cadência de agendado para motor central`
10. `feat: adiciona endpoint de diagnóstico manual`
11. `test: adiciona testes do motor de decisão`
12. `test: adiciona testes de integração end-to-end`
13. `test: valida ausência de regressão`

**Arquivos criados:**
- `src/lib/followup/evaluator.ts`
- `src/lib/followup/orchestrator.ts`
- `src/app/api/followups/diagnose/route.ts`
- `docs/followup-v2/FOLLOWUP_DECISION_MATRIX.md`
- `docs/followup-v2/FOLLOWUP_REASON_CODES.md`
- `tests/followup-evaluator.test.ts`
- `tests/followup-orchestrator.test.ts`
- `tests/followup-orchestrator.integration.test.ts`

**Arquivos modificados:**
- `src/lib/followup/lead-cadence.ts` — usa motor
- `src/lib/followup/atendimento-cadence.ts` — usa motor
- `src/lib/followup/agendado-cadence.ts` — usa motor
- `src/types/followup.ts` — adiciona tipos novos

**Critério de merge:**
- ✅ Motor centralizado funcionando
- ✅ Todas as 3 cadências migradas
- ✅ Nenhuma regressão detectada
- ✅ Testes de integração passando
- ✅ Performance validada (benchmark)
- ✅ Code review aprovado

---

### PR #4: Fase 3 — UI de Visibilidade

**Branch:** `feat/followup-v2-phase-3`  
**Tamanho:** ~2.500 linhas  
**Duração:** 14 dias  
**Risco:** 🟡 Médio (mudanças visuais extensivas)

**Commits:**
1. `feat: adiciona card de follow-up no Desk`
2. `feat: adiciona badges no Kanban`
3. `feat: reestrutura Central de Follow-ups com abas`
4. `feat: adiciona tabela de follow-ups programados`
5. `feat: adiciona tabela de follow-ups em esteira`
6. `feat: adiciona tabela de follow-ups bloqueados`
7. `feat: adiciona filtros avançados na Central`
8. `feat: adiciona ações rápidas (enviar/cancelar/reagendar)`
9. `feat: adiciona dashboard de métricas`
10. `test: adiciona testes E2E de UI`
11. `docs: adiciona guia operacional para operadores`

**Arquivos criados:**
- `src/components/desk/followup-status-card.tsx`
- `src/components/kanban/followup-badge.tsx`
- `src/app/(dashboard)/followups-v2/page.tsx`
- `src/components/followups/followups-table.tsx`
- `src/components/followups/followup-filters.tsx`
- `src/components/followups/followup-actions.tsx`
- `src/components/followups/metrics-dashboard.tsx`
- `src/app/api/followups/list/route.ts`
- `src/app/api/followups/dashboard/route.ts`
- `docs/FOLLOWUP_OPERATOR_GUIDE.md`
- `tests/followups-ui.e2e.test.ts`

**Arquivos modificados:**
- `src/components/desk/chat-view.tsx` — adiciona card
- `src/components/kanban/conversation-card.tsx` — adiciona badge
- `src/app/(dashboard)/layout.tsx` — link na nav

**Critério de merge:**
- ✅ Card visível no Desk
- ✅ Badges aparecendo no Kanban
- ✅ Central com todas as abas funcionais
- ✅ Filtros operacionais
- ✅ Ações funcionando
- ✅ Testes E2E passando
- ✅ Guia operacional revisado pelo Suporte
- ✅ Code review aprovado

---

### PR #5: Fase 4 — Retomada Humano Parado

**Branch:** `feat/followup-v2-phase-4`  
**Tamanho:** ~1.800 linhas  
**Duração:** 10 dias  
**Risco:** 🟡 Médio (nova lógica de automação)

**Commits:**
1. `feat: adiciona migration para config de retomada humana`
2. `feat: adiciona seção de config de retomada na UI`
3. `feat: cria detector de conversas humanas estagnadas`
4. `feat: cria avaliador de contexto com IA`
5. `feat: integra retomada no motor de decisão`
6. `feat: cria cron job de retomada`
7. `feat: adiciona aba "Humano parado" na Central`
8. `feat: adiciona card de retomada sugerida no Desk`
9. `test: adiciona testes de retomada humana`
10. `docs: documenta fluxo de retomada`

**Arquivos criados:**
- `supabase/migrations/046_human_retake_config.sql`
- `src/lib/followup/human-retake.ts`
- `src/lib/followup/context-analyzer.ts`
- `src/app/api/cron/human-retake/route.ts`
- `src/app/api/followups/stagnated/route.ts`
- `src/components/followups/stagnated-conversations-table.tsx`
- `src/components/desk/retake-suggestion-card.tsx`
- `tests/human-retake.test.ts`
- `tests/human-retake.integration.test.ts`

**Arquivos modificados:**
- `src/lib/followup/evaluator.ts` — adiciona check de estagnação
- `src/components/desk/followup-status-card.tsx` — adiciona modo retomada
- `src/app/(dashboard)/followups-v2/page.tsx` — adiciona aba
- `panel_bot_config` — novos campos via migration

**Critério de merge:**
- ✅ Detector funcionando
- ✅ IA avaliando contexto
- ✅ Modo `suggest_only` operacional
- ✅ Aba "Humano parado" funcional
- ✅ Card de sugestão no Desk
- ✅ Cron job rodando
- ✅ Testes de integração passando
- ✅ Code review aprovado

---

### PR #6: Fase 5 — IA Contextual

**Branch:** `feat/followup-v2-phase-5`  
**Tamanho:** ~2.000 linhas  
**Duração:** 14 dias  
**Risco:** 🟡 Médio (features avançadas, não críticas)

**Commits:**
1. `feat: adiciona análise de sentimento refinada`
2. `feat: adiciona geração contextual de mensagens`
3. `feat: implementa heurísticas de timing otimizado`
4. `feat: cria feedback loop de taxa de resposta`
5. `feat: adiciona migration para A/B testing`
6. `feat: implementa seleção de variantes A/B`
7. `feat: cria dashboard de performance`
8. `feat: adiciona alertas inteligentes`
9. `test: adiciona testes de IA contextual`
10. `docs: atualiza guia operacional completo`
11. `docs: atualiza CLAUDE.md final`

**Arquivos criados:**
- `supabase/migrations/047_followup_ab_tests.sql`
- `src/lib/followup/message-generator.ts`
- `src/lib/followup/timing.ts`
- `src/lib/followup/alerts.ts`
- `src/app/(dashboard)/followups-v2/analytics/page.tsx`
- `src/app/api/followups/analytics/route.ts`
- `src/components/followups/performance-dashboard.tsx`
- `tests/message-generator.test.ts`
- `tests/timing.test.ts`

**Arquivos modificados:**
- `src/lib/followup/context-analyzer.ts` — análise refinada
- `src/lib/followup/evaluator.ts` — integra timing
- `src/lib/followup/orchestrator.ts` — integra A/B e alertas
- `CLAUDE.md` — atualização final

**Critério de merge:**
- ✅ Análise refinada funcionando
- ✅ Mensagens contextuais geradas
- ✅ Timing otimizado aplicado
- ✅ Feedback loop operacional
- ✅ A/B testing funcional
- ✅ Dashboard de performance
- ✅ Alertas configuráveis
- ✅ Documentação completa
- ✅ Code review aprovado

---

## 🚀 Timeline de Execução

```text
Semana 1:  Fase 0 (Dias 1-3)
Semana 2:  Fase 1 (Dias 4-10)
Semana 3-4: Fase 2 (Dias 11-24)
Semana 5-6: Fase 3 (Dias 25-38)
Semana 7:  Fase 4 (Dias 39-48)
Semana 8-9: Fase 5 (Dias 49-62)
```

**Total:** ~9 semanas (buffer incluído)

---

## 📋 Checklist de Cada PR

Antes de criar o PR:

- [ ] Todos os commits seguem [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Testes unitários passando localmente
- [ ] Testes de integração passando (se aplicável)
- [ ] Nenhum `console.log` esquecido
- [ ] Nenhum `TODO` crítico pendente
- [ ] Migration testada em ambiente local
- [ ] Cobertura de testes validada (target: > 80%)
- [ ] Documentação atualizada (`CLAUDE.md` ou `docs/`)
- [ ] Branch atualizada com `feat/followup-v2` (rebase)

Ao criar o PR:

- [ ] Título claro: `feat(followup): [Fase X] - descrição`
- [ ] Descrição detalhada com contexto
- [ ] Screenshots/GIFs (se mudança visual)
- [ ] Checklist de acceptance criteria
- [ ] Reviewers atribuídos: @dev-lead @cto
- [ ] Labels: `feature`, `followup-v2`, `phase-X`
- [ ] Milestone: `Follow-up V2`

Após aprovação:

- [ ] Squash merge em `feat/followup-v2`
- [ ] Deploy em staging
- [ ] Smoke tests manuais
- [ ] Aprovação de QA/Produto
- [ ] Delete branch efêmera

---

## 🔒 Proteções de Branch

### `main`

- ✅ Requer PR
- ✅ Requer 1+ aprovações
- ✅ Requer testes passando
- ✅ Requer branch atualizada
- ✅ Proibido force push
- ✅ Proibido delete

### `feat/followup-v2`

- ✅ Requer PR para merges de fase
- ✅ Requer 1+ aprovações
- ✅ Requer testes passando
- ✅ Permite force push (só owner)

### Branches de fase (efêmeras)

- ✅ Sem proteção especial
- ✅ Delete após merge

---

## 🎯 Estratégia de Deploy

### Staging

- Deploy automático ao mergear em `feat/followup-v2`
- Testes manuais obrigatórios
- Cliente de teste: ChoiExpert Hair Clinic

### Produção

- Deploy manual após cada fase aprovada em staging
- Merge `feat/followup-v2` → `main` ao final de cada fase
- Rollback plan: revert commit + redeploy

### Feature Flags (opcional para fases avançadas)

```typescript
// .env
FEATURE_FOLLOWUP_V2_ENABLED=true
FEATURE_FOLLOWUP_HUMAN_RETAKE_ENABLED=false  // Fase 4
FEATURE_FOLLOWUP_AI_CONTEXTUAL_ENABLED=false // Fase 5
```

---

## ⚠️ Riscos e Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Regressão no envio de follow-ups | Média | Alto | Testes de regressão extensivos na Fase 2 |
| Performance degradada (queries lentas) | Baixa | Médio | Índices otimizados, monitoramento APM |
| Conflitos de merge entre fases | Alta | Baixo | Rebase frequente, comunicação constante |
| IA sugere retomada inadequada | Média | Médio | Modo `suggest_only` na V1, aprovação humana |
| Alertas excessivos (fadiga) | Baixa | Baixo | Thresholds configuráveis, throttling |

---

## 📊 Métricas de Sucesso do Projeto

### Por PR

- ✅ Tempo de review < 2 dias úteis
- ✅ Bugs encontrados em code review < 3
- ✅ Deploy em staging sem rollback
- ✅ Aprovação de QA/Produto

### Ao final de cada fase

- ✅ Cobertura de testes mantida > 80%
- ✅ Performance sem degradação (benchmark)
- ✅ Zero bugs críticos em produção

### Ao final do projeto

- ✅ 6 PRs mergeados
- ✅ Feature completa em produção
- ✅ NPS interno do time +60
- ✅ Taxa de resposta de follow-up +20%
- ✅ Tempo de diagnóstico < 2min

---

## 🎓 Boas Práticas

### Commits

```bash
# Bom ✅
git commit -m "feat: adiciona tabela conversation_followup_state"
git commit -m "test: adiciona testes de estado de follow-up"
git commit -m "docs: atualiza CLAUDE.md com novas tabelas"

# Ruim ❌
git commit -m "wip"
git commit -m "fix stuff"
git commit -m "updates"
```

### Mensagens de PR

```markdown
# Exemplo de PR description

## Contexto

Fase 1 do projeto de reestruturação de follow-ups. Adiciona rastreabilidade completa com estado consolidado e eventos auditáveis.

## Mudanças

- ✅ Cria tabela `conversation_followup_state`
- ✅ Cria tabela `followup_events`
- ✅ Implementa helpers de estado e eventos
- ✅ Integra eventos na timeline do Desk
- ✅ Adiciona testes unitários e de integração

## Testes

- [x] Testes unitários passando localmente
- [x] Migration testada em dev
- [x] Timeline mostrando eventos no Desk
- [x] Cobertura > 80%

## Screenshots

[adicionar screenshots da timeline com eventos]

## Checklist

- [x] Code review solicitado
- [x] Documentação atualizada
- [x] Sem TODOs críticos
- [ ] Aprovação do dev-lead
- [ ] Aprovação do CTO

## Riscos

- 🟡 Mudança no pipeline de envio — validar regressão
- 🟢 Tabelas novas — sem impacto em dados existentes
```

---

## 🏁 Próximos Passos Imediatos

### Hoje (2026-05-07)

1. ✅ Criar branch `feat/followup-v2` a partir de `main`
2. ✅ Criar branch `feat/followup-v2-phase-0`
3. ✅ Iniciar Fase 0: Diagnóstico

### Amanhã (2026-05-08)

1. ⬜ Mapear pontos de envio e skip
2. ⬜ Criar `FOLLOWUP_AUDIT_SEND_POINTS.md`
3. ⬜ Criar `FOLLOWUP_AUDIT_SKIP_POINTS.md`

### Esta Semana

1. ⬜ Completar Fase 0 (3 dias)
2. ⬜ Criar PR #1
3. ⬜ Review e merge
4. ⬜ Iniciar Fase 1

---

## ✅ Aprovação

| Papel | Nome | Aprovado | Data |
|---|---|---|---|
| CTO | — | ⬜ | — |
| Dev Lead | — | ⬜ | — |
| DevOps | — | ⬜ | — |

---

**Versão:** 1.0  
**Última atualização:** 2026-05-07  
**Autor:** CTO ChatSales  
