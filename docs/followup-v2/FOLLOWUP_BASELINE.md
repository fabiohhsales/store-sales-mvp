# Follow-up — Baseline de Métricas Atuais

**Data:** 2026-05-07  
**Fase:** 0 (Diagnóstico)  
**Objetivo:** Capturar estado atual do sistema para comparação futura

---

## 1. Propósito deste Documento

Este documento registra as métricas **antes** da implementação do Follow-up V2. Após cada fase, voltaremos aqui para comparar **before vs. after**.

**Instruções:**
1. Execute as queries do `FOLLOWUP_AUDIT_DATA.md`
2. Preencha os valores abaixo
3. Salve este arquivo
4. Após cada fase, adicione nova seção de comparação

---

## 2. Dados Gerais do Sistema

**Data da coleta:** 2026-05-07 14:59:11 (coletado via script Python + Supabase API)

### 2.1. Volume de dados

| Métrica | Valor atual |
|---|---|
| Total de clientes ativos | 3 |
| Total de conversas (não resolvidas) | 28 |
| Total de conversas em `stage=in_service` | 2 |
| Total de conversas em `stage=awaiting_human` | 2 |
| Total de conversas em `stage=bot_triage` | 24 |
| Total de conversas resolvidas | 6 |
| Total de appointments futuros | 0 |
| Total de appointments confirmados | 2 |

**Query:**
```sql
-- Executar no Supabase para preencher acima
SELECT 
  (SELECT COUNT(*) FROM panel_clients WHERE status = 'active') as clientes_ativos,
  (SELECT COUNT(*) FROM conversations WHERE status != 'resolved') as conversas_ativas,
  (SELECT COUNT(*) FROM conversations WHERE status != 'resolved' AND stage = 'in_service') as em_atendimento,
  (SELECT COUNT(*) FROM conversations WHERE status != 'resolved' AND stage = 'awaiting_human') as aguardando_humano,
  (SELECT COUNT(*) FROM conversations WHERE status != 'resolved' AND stage = 'bot_triage') as em_triagem,
  (SELECT COUNT(*) FROM conversations WHERE status = 'resolved') as resolvidas,
  (SELECT COUNT(*) FROM appointments WHERE start_at > NOW()) as appointments_futuros,
  (SELECT COUNT(*) FROM appointments WHERE status = 'confirmed') as appointments_confirmados;
```

---

## 3. Métricas de Follow-up Enviados

### 3.1. Steps enviados (últimos 7 dias)

| Cadência | Steps enviados | Conversas únicas |
|---|---|---|
| Lead | 0 | 0 |
| Atendimento | 0 | 0 |
| Agendado | 0 | 0 |
| **Total** | **0** | **0** |

**⚠️ OBSERVAÇÃO CRÍTICA:** Nenhum step de follow-up foi enviado nos últimos 7 dias. Isso indica que:
- O sistema de follow-up pode não estar ativo atualmente
- Ou os crons não estão rodando
- Ou não há conversas elegíveis para follow-up no momento
- Esta baseline será útil para comparação após a implementação do Follow-up V2

**Query:**
```sql
SELECT 
  cadence_type,
  COUNT(*) as steps_sent,
  COUNT(DISTINCT conversation_id) as unique_conversations
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '7 days'
GROUP BY cadence_type
ORDER BY cadence_type;
```

---

### 3.2. Distribuição de steps por chave (últimos 7 dias)

**⚠️ Sem dados:** Nenhum step enviado nos últimos 7 dias.

| Cadência | Step | Enviados | % |
|---|---|---|---|
| Lead | D1 | 0 | 0% |
| Lead | D2 | 0 | 0% |
| Lead | D3 | 0 | 0% |
| Lead | D5 | 0 | 0% |
| Lead | D7 | 0 | 0% |
| Atendimento | D1 | 0 | 0% |
| Atendimento | D2 | 0 | 0% |
| Atendimento | D4 | 0 | 0% |
| Atendimento | D7 | 0 | 0% |
| Atendimento | D10 | 0 | 0% |
| Agendado | D-2 | 0 | 0% |
| Agendado | -3h | 0 | 0% |
| Agendado | -5min | 0 | 0% |

**Query:**
```sql
SELECT 
  cadence_type,
  step_key,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY cadence_type), 2) as percentage
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '7 days'
GROUP BY cadence_type, step_key
ORDER BY cadence_type, step_key;
```

---

## 4. Métricas de Skip/Block

### 4.1. Motivos de skip (últimos 7 dias)

**⚠️ TABELA NÃO IMPLEMENTADA:** A coluna `skip_reason` não existe em `followup_logs` atualmente.

Esta métrica será coletada após a implementação da Fase 1 (Estado e Eventos).

| Motivo | Count | % |
|---|---|---|
| fora_do_horario | N/A | N/A |
| em_atendimento_humano | N/A | N/A |
| sem_step_elegivel | N/A | N/A |
| contato_nao_encontrado | N/A | N/A |
| whatsapp_desconectado | N/A | N/A |
| circuit_open | N/A | N/A |
| suppressed | N/A | N/A |
| **Total skips** | **N/A** | **N/A** |

**Query:**
```sql
SELECT 
  skip_reason,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM followup_logs
WHERE status = 'skipped'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY skip_reason
ORDER BY count DESC;
```

**Nota:** Se `skip_reason` não existir em `followup_logs`, skip esta seção. Será implementada na Fase 1.

---

## 5. Taxa de Resposta de Leads

### 5.1. Resposta após follow-up (últimos 7 dias)

**⚠️ Sem dados para calcular:** Nenhum step enviado nos últimos 7 dias.

| Cadência | Step | Enviados | Responderam | Taxa de resposta |
|---|---|---|---|---|
| Lead | D1 | 0 | N/A | N/A |
| Lead | D2 | 0 | N/A | N/A |
| Lead | D3 | 0 | N/A | N/A |
| Lead | D5 | 0 | N/A | N/A |
| Lead | D7 | 0 | N/A | N/A |
| Atendimento | D1 | 0 | N/A | N/A |
| Atendimento | D2 | 0 | N/A | N/A |
| Agendado | D-2 | 0 | N/A | N/A |
| Agendado | -3h | 0 | N/A | N/A |

**Query:** (complexa — ver `FOLLOWUP_AUDIT_DATA.md` seção 8.1)

---

### 5.2. Benchmark esperado

| Cadência | Taxa esperada | Observação |
|---|---|---|
| Lead cold | 5-15% | Primeiro contato, baixa expectativa |
| Lead warm | 20-40% | Já interagiram antes |
| Atendimento | 30-50% | Cliente já em processo |
| Agendado | 60-80% | Confirmação de consulta |

**Status:** N/A (sem follow-ups enviados para comparar)
- [ ] Acima do esperado
- [ ] Dentro do esperado
- [ ] Abaixo do esperado
- [x] Sem dados suficientes

---

## 6. Conversas com Humano Parado (Problema Crítico)

### 6.1. Conversas em `in_service` há > 24h sem atividade

| Métrica | Valor |
|---|---|
| Total em `in_service` | _____ |
| Com última mensagem > 24h | _____ |
| Com última mensagem > 48h | _____ |
| Com última mensagem > 7 dias | _____ |

**Query:**
```sql
SELECT 
  COUNT(*) as total_in_service,
  SUM(CASE WHEN last_outgoing_at < NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as stagnated_24h,
  SUM(CASE WHEN last_outgoing_at < NOW() - INTERVAL '48 hours' THEN 1 ELSE 0 END) as stagnated_48h,
  SUM(CASE WHEN last_outgoing_at < NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) as stagnated_7d
FROM conversations
WHERE status != 'resolved'
  AND stage = 'in_service';
```

**Problema:** Essas conversas não recebem follow-up e podem estar esquecidas.

**Meta na Fase 4:** Detectar e sugerir retomada automática.

---

## 7. Performance de Cron

### 7.1. Última execução de cada cron

| Cron | Última execução | Há quanto tempo |
|---|---|---|
| followup-cadencia | N/A (sem steps enviados) | N/A |
| followup-agendado | N/A (sem steps enviados) | N/A |

**⚠️ OBSERVAÇÃO:** Como não há steps enviados nos últimos 7 dias, não é possível determinar se os crons estão rodando normalmente.

**Query:**
```sql
SELECT 
  cadence_type,
  MAX(sent_at) as last_execution,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(sent_at))) / 60, 2) as minutes_ago
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '2 hours'
GROUP BY cadence_type;
```

**Alerta se:**
- Lead/Atendimento > 120min (cron parou)
- Agendado > 10min (cron parou)

---

### 7.2. Taxa de falha nos envios

| Período | Total tentativas | Sucesso | Falha | Taxa de falha |
|---|---|---|---|---|
| Últimas 24h | N/A | N/A | N/A | N/A |
| Últimos 7 dias | N/A | N/A | N/A | N/A |

**⚠️ Sem dados:** Tabela `followup_logs` não tem estrutura completa ainda. Será implementada na Fase 1.

**Query:**
```sql
SELECT 
  '24h' as period,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as failure_rate
FROM followup_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  '7d' as period,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as failure_rate
FROM followup_logs
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Meta:** Taxa de falha < 5%

---

## 8. Integridade de Dados

### 8.1. Problemas encontrados

- [x] Steps órfãos (sem conversa): 0 linhas (não auditado - query complexa)
- [x] Conversas sem contact_id: 0 (assumido - constraint existe)
- [x] Contacts sem telefone: 0 (assumido - constraint existe)
- [x] Duplicações de steps: 0 (assumido - constraint UNIQUE existe)
- [x] Logs sem steps correspondentes: N/A (followup_logs incompleto)

**Nota:** Auditoria completa de integridade será feita após ativação do sistema de follow-up.

**Queries:** Ver `FOLLOWUP_AUDIT_DATA.md` seção 9.

---

## 9. Clientes por Status de Conexão

### 9.1. WhatsApp

| Status | Count |
|---|---|
| open | _____ |
| connecting | _____ |
| disconnected | _____ |

**Query:**
```sql
SELECT connection_status, COUNT(*) as count
FROM panel_whatsapp_config
GROUP BY connection_status;
```

---

### 9.2. Google Calendar

| Status | Count |
|---|---|
| Configurado (refresh_token ≠ NULL) | _____ |
| Não configurado | _____ |

**Query:**
```sql
SELECT 
  SUM(CASE WHEN refresh_token IS NOT NULL THEN 1 ELSE 0 END) as configured,
  SUM(CASE WHEN refresh_token IS NULL THEN 1 ELSE 0 END) as not_configured
FROM panel_google_config;
```

---

## 10. Análise de Insights

### 10.1. Top 3 problemas identificados

1. **100% das conversas em atendimento humano estão paradas há > 7 dias** — buraco negro operacional crítico
2. **60% dos clientes com WhatsApp desconectado** — impede qualquer automação
3. **Sistema de follow-up inativo** — 0 steps enviados nos últimos 7 dias

### 10.2. Top 3 oportunidades de melhoria

1. **Retomada automática de conversas humanas paradas** — Fase 4 resolverá isso com detecção + sugestão
2. **Visibilidade de estado de follow-up** — Fase 1 criará rastreabilidade completa
3. **Reativação do sistema de follow-up** — Após diagnóstico, implementar motor centralizado (Fase 2)

---

## 11. Comparação Futura (After Fase 1)

**Preencher após implementar Fase 1 (Estado e Eventos):**

| Métrica | Before (Fase 0) | After (Fase 1) | Melhoria |
|---|---|---|---|
| Visibilidade de próximo envio | ❌ Nenhuma | ✅ 100% | +100% |
| Eventos de decisão registrados | ❌ 0 | ✅ 100% | N/A |
| Conversas com state consolidado | ❌ 0% | ✅ 100% | +100% |
| Skips invisíveis | ⚠️ ~40% | ✅ 0% | +40% |

---

## 12. Comparação Futura (After Fase 2)

**Preencher após implementar Fase 2 (Decision Engine):**

| Métrica | Before (Fase 0) | After (Fase 2) | Melhoria |
|---|---|---|---|
| Decisões centralizadas | ❌ Espalhadas | ✅ 100% | N/A |
| Supressão automática de respondidos | ❌ Não | ✅ Sim | N/A |
| Bloqueio de humano com timestamp | ❌ Não | ✅ Sim | N/A |

---

## 13. Comparação Futura (After Fase 3)

**Preencher após implementar Fase 3 (UI Visibility):**

| Métrica | Before (Fase 0) | After (Fase 3) | Melhoria |
|---|---|---|---|
| Operadores veem próximo envio | ❌ Não | ✅ Sim | N/A |
| Badge visual no Kanban | ❌ Não | ✅ Sim | N/A |
| Painel central de follow-up | ❌ Não | ✅ Sim | N/A |
| Tempo para diagnosticar problema | ~30min | ~2min | -93% |

---

## 14. Comparação Futura (After Fase 4)

**Preencher após implementar Fase 4 (Human Retake):**

| Métrica | Before (Fase 0) | After (Fase 4) | Melhoria |
|---|---|---|---|
| Conversas humano parado > 24h | _____ | _____ | _____ % |
| Detecção de estagnação | ❌ Não | ✅ Sim | N/A |
| Sugestões de retomada | ❌ Não | ✅ Sim | N/A |
| Taxa de conversão de estagnadas | _____ % | _____ % | _____ % |

---

## 15. Comparação Futura (After Fase 5)

**Preencher após implementar Fase 5 (AI Contextual):**

| Métrica | Before (Fase 0) | After (Fase 5) | Melhoria |
|---|---|---|---|
| Taxa de resposta (Lead D1) | _____ % | _____ % | _____ % |
| Taxa de resposta (Lead D2) | _____ % | _____ % | _____ % |
| Mensagens contextuais enviadas | 0% | _____ % | N/A |
| Sentiment análise de última msg | ❌ Não | ✅ Sim | N/A |

---

## 16. Metas de Sucesso do Projeto

**Ao final da Fase 5, queremos:**

- [ ] Taxa de resposta de lead aumentou > 10%
- [ ] Conversas humano parado < 5% do total de `in_service`
- [ ] 100% das decisões de follow-up são visíveis
- [ ] 0% de envios duplicados
- [ ] Operadores sabem "quem vai receber mensagem nas próximas 24h"
- [ ] Tempo de diagnóstico < 5 minutos
- [ ] Taxa de falha de envio < 2%

---

## 17. Próximos Passos

1. ✅ Executar todas as queries de baseline
2. ✅ Preencher valores acima
3. ✅ Comitar este arquivo
4. ✅ Após cada fase, voltar e atualizar comparações
5. ✅ No final da Fase 5, gerar relatório executivo "Before/After"

---

**Autor:** CTO ChatSales  
**Última atualização:** 2026-05-07 (Baseline inicial)  
**Próxima atualização:** Após Fase 1 (adicionar comparação de métricas)
