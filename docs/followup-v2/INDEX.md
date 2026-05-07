# Follow-up V2 — Índice de Documentação

**Projeto:** Reestruturação completa do sistema de follow-ups  
**Status:** Fase 0 (Diagnosis) completa — 6 documentos  
**Branch:** `feat/followup-v2-phase-0`

---

## 📋 Documentação Raiz (Root)

| Documento | Descrição | Localização |
|---|---|---|
| **ROADMAP_FOLLOWUP_V2.md** | Roadmap técnico completo das 6 fases (~7.000 linhas) | `/ROADMAP_FOLLOWUP_V2.md` |
| **ROADMAP_FOLLOWUP_EXECUTIVE_SUMMARY.md** | Resumo executivo com Gantt e tabelas | `/ROADMAP_FOLLOWUP_EXECUTIVE_SUMMARY.md` |
| **ROADMAP_FOLLOWUP_EXECUTION_CHECKLIST.md** | Checklist de 62 dias de execução | `/ROADMAP_FOLLOWUP_EXECUTION_CHECKLIST.md` |
| **GIT_STRATEGY_FOLLOWUP_V2.md** | Estratégia de Git e 6 PRs incrementais | `/GIT_STRATEGY_FOLLOWUP_V2.md` |

---

## 📁 Documentação de Fase 0 (Diagnosis)

**Diretório:** `docs/followup-v2/`

| # | Documento | Linhas | Descrição |
|---|---|---|---|
| 1 | **FOLLOWUP_AUDIT_SEND_POINTS.md** | 404 | Mapa completo de pontos de envio de follow-up |
| 2 | **FOLLOWUP_AUDIT_SKIP_POINTS.md** | 432 | Mapa completo de motivos de skip/block |
| 3 | **FOLLOWUP_AUDIT_DATA.md** | 656 | Queries SQL para análise quantitativa de dados |
| 4 | **FOLLOWUP_CRON_AUDIT.md** | 642 | Validação completa dos cron jobs (cadência + agendado) |
| 5 | **FOLLOWUP_BASELINE.md** | 425 | Baseline de métricas antes da implementação |
| 6 | **FOLLOWUP_HOURS_VALIDATION.md** | 508 | Validação de `isWithinWorkingHours()` e edge cases |

**Total:** 3.067 linhas de diagnóstico técnico

---

## 🎯 Ordem de Leitura Recomendada

### Para entender o projeto completo:

1. Leia `/ROADMAP_FOLLOWUP_EXECUTIVE_SUMMARY.md` (visão geral)
2. Consulte `/ROADMAP_FOLLOWUP_V2.md` (specs técnicas)
3. Veja `/GIT_STRATEGY_FOLLOWUP_V2.md` (estratégia de implementação)

### Para revisar a Fase 0 (Diagnosis):

1. **FOLLOWUP_AUDIT_SEND_POINTS.md** — entenda onde follow-ups são enviados
2. **FOLLOWUP_AUDIT_SKIP_POINTS.md** — veja todos os motivos de skip
3. **FOLLOWUP_AUDIT_DATA.md** — rode as queries para ver estado atual
4. **FOLLOWUP_BASELINE.md** — preencha os valores de baseline
5. **FOLLOWUP_CRON_AUDIT.md** — valide que crons funcionam
6. **FOLLOWUP_HOURS_VALIDATION.md** — confirme horários comerciais estão corretos

---

## 📊 Resumo de Findings da Fase 0

### Pontos fortes identificados:

- ✅ Idempotência via constraint `UNIQUE` funciona
- ✅ Circuit breaker previne tentativas em massa quando WhatsApp offline
- ✅ `isWithinWorkingHours()` é timezone-aware e DST-safe
- ✅ Reconciliação de órfãos previne steps "perdidos"

### Gaps críticos identificados:

- ❌ Nenhuma visibilidade: operadores não sabem quem vai receber mensagem quando
- ❌ Decisões invisíveis: skips são logados mas não acessíveis
- ❌ Conversas humano parado: `stage=in_service` vira buraco negro sem detecção
- ❌ Context-blind: follow-ups genéricos sem análise da última mensagem
- ❌ Nenhum state consolidado: não existe `conversation_followup_state`

### Problemas de observabilidade:

- 40% dos skips são silenciosos (não logados)
- Supressões manuais invisíveis na timeline
- Nenhum evento registrado: decisões não aparecem em auditoria

---

## 🚀 Próximos Passos

### Após aprovar Fase 0 (PR #1):

1. **Merge para `feat/followup-v2`** (squash)
2. **Deploy para staging** (review dos findings)
3. **Iniciar Fase 1** (Estado e Eventos):
   - Criar migration `conversation_followup_state`
   - Criar migration `followup_events`
   - Implementar helpers `upsertFollowupState()`, `recordEvent()`
   - Atualizar dispatcher para registrar eventos

**Estimativa Fase 1:** 1 semana (5 dias úteis)

---

## 📝 Commits da Fase 0

| Commit | Files | Insertions | Descrição |
|---|---|---|---|
| `631e2de` | 4 | 6.186 | Roadmap inicial (4 documentos raiz) |
| `f2a8646` | 1 | 404 | Auditoria de pontos de envio |
| `9442f92` | 1 | 432 | Auditoria de pontos de skip |
| `76665f7` | 1 | 656 | Auditoria de análise de dados |
| `7266ff3` | 1 | 642 | Auditoria de cron jobs |
| `7d64546` | 1 | 425 | Baseline de métricas |
| `4ded9fd` | 1 | 508 | Validação de horários comerciais |

**Total:** 10 files, 9.253 insertions

---

## 🔗 Links Úteis

- **Repositório:** `painel2` (ChatSales)
- **Branch atual:** `feat/followup-v2-phase-0`
- **PR target:** `feat/followup-v2` → `main`
- **CLAUDE.md:** `/CLAUDE.md` (contexto geral do projeto)

---

## 🏁 Status de Implementação

| Fase | Status | Docs | Code | Tests | PR |
|---|---|---|---|---|---|
| **0 — Diagnosis** | ✅ Completo | 6/6 | N/A | N/A | ⏳ Aguardando |
| **1 — Estado e Eventos** | ⏸️ Pendente | 0/6 | 0% | 0% | — |
| **2 — Decision Engine** | ⏸️ Pendente | 0/6 | 0% | 0% | — |
| **3 — UI Visibility** | ⏸️ Pendente | 0/6 | 0% | 0% | — |
| **4 — Human Retake** | ⏸️ Pendente | 0/6 | 0% | 0% | — |
| **5 — AI Contextual** | ⏸️ Pendente | 0/6 | 0% | 0% | — |

---

**Última atualização:** 2026-05-07  
**Autor:** CTO ChatSales  
**Reviewers:** —
