# Auditoria — Análise de Dados de Follow-up

**Data:** 2026-05-07  
**Fase:** 0 (Diagnóstico)  
**Objetivo:** Analisar quantitativamente o estado atual dos dados de follow-up

---

## 1. Visão Geral

Este documento contém queries SQL para auditar o estado atual dos dados de follow-up no banco Supabase. Execute estas queries para obter a baseline de métricas.

---

## 2. Análise da Tabela `followup_cadence_steps`

### 2.1. Total de steps enviados por cadência

```sql
SELECT 
  cadence_type,
  COUNT(*) as total_steps,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  MIN(sent_at) as first_sent,
  MAX(sent_at) as last_sent
FROM followup_cadence_steps
GROUP BY cadence_type
ORDER BY total_steps DESC;
```

**Objetivo:** Ver volume de envios por cadência desde o início.

**Resultado esperado:**
| cadence_type | total_steps | unique_conversations | first_sent | last_sent |
|---|---|---|---|---|
| lead | ? | ? | ? | ? |
| atendimento | ? | ? | ? | ? |
| agendado | ? | ? | ? | ? |

---

### 2.2. Distribuição de steps por chave (últimos 7 dias)

```sql
SELECT 
  cadence_type,
  step_key,
  COUNT(*) as count,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY cadence_type), 2) as percentage
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '7 days'
GROUP BY cadence_type, step_key
ORDER BY cadence_type, count DESC;
```

**Objetivo:** Entender qual step de cada cadência é mais enviado.

**Insights esperados:**
- Lead D1 deve ter mais envios que D7 (funil)
- Agendado -3h deve ter menos que D-2 (nem todos confirmam)

---

### 2.3. Conversas com múltiplos steps na mesma cadência

```sql
SELECT 
  conversation_id,
  cadence_type,
  COUNT(*) as step_count,
  ARRAY_AGG(step_key ORDER BY sent_at) as steps_sequence,
  MIN(sent_at) as first_step_at,
  MAX(sent_at) as last_step_at
FROM followup_cadence_steps
GROUP BY conversation_id, cadence_type
HAVING COUNT(*) > 1
ORDER BY step_count DESC
LIMIT 50;
```

**Objetivo:** Ver progressão de steps — conversas que receberam múltiplas mensagens sem responder.

**Análise:**
- Quantas conversas passam de D1 → D2 → D3?
- Qual a taxa de "abandono" entre steps?

---

### 2.4. Conversas com steps em múltiplas cadências

```sql
SELECT 
  conversation_id,
  ARRAY_AGG(DISTINCT cadence_type) as cadences,
  COUNT(DISTINCT cadence_type) as cadence_count,
  COUNT(*) as total_steps
FROM followup_cadence_steps
GROUP BY conversation_id
HAVING COUNT(DISTINCT cadence_type) > 1
ORDER BY cadence_count DESC, total_steps DESC
LIMIT 50;
```

**Objetivo:** Detectar conversas que migraram entre cadências (ex: lead → atendimento → agendado).

**Problema potencial:** Conversas podem estar em múltiplas cadências simultaneamente sem controle de prioridade.

---

### 2.5. Verificação de duplicações (mesmo step enviado múltiplas vezes)

```sql
SELECT 
  conversation_id,
  cadence_type,
  step_key,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(sent_at ORDER BY sent_at) as sent_times
FROM followup_cadence_steps
GROUP BY conversation_id, cadence_type, step_key
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 100;
```

**Objetivo:** Validar se constraint UNIQUE está funcionando ou se houve envios duplicados antes da constraint.

**Resultado esperado:** **Zero duplicações** (constraint deve prevenir).

**Se encontrar duplicações:** Bug crítico ou dados legados pré-constraint.

---

### 2.6. Steps enviados nas últimas 24h por hora

```sql
SELECT 
  cadence_type,
  DATE_TRUNC('hour', sent_at) as hour,
  COUNT(*) as steps_sent
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '24 hours'
GROUP BY cadence_type, DATE_TRUNC('hour', sent_at)
ORDER BY cadence_type, hour DESC;
```

**Objetivo:** Ver padrão de envio ao longo do dia — validar se horário comercial está funcionando.

**Análise esperada:**
- Picos durante horário comercial
- Zero envios à noite/madrugada (se `working_hours` configurado)

---

## 3. Análise da Tabela `followup_logs`

### 3.1. Total de logs por status

```sql
SELECT 
  status,
  COUNT(*) as count
FROM followup_logs
GROUP BY status
ORDER BY count DESC;
```

**Objetivo:** Ver proporção de envios bem-sucedidos vs. falhas.

**Resultado esperado:**
| status | count |
|---|---|
| sent | X (maioria) |
| failed | Y (poucos) |
| skipped | Z |

---

### 3.2. Logs de falha (últimos 7 dias)

```sql
SELECT 
  cadence_type,
  step_key,
  error_message,
  COUNT(*) as error_count
FROM followup_logs
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY cadence_type, step_key, error_message
ORDER BY error_count DESC
LIMIT 20;
```

**Objetivo:** Identificar erros recorrentes.

**Problemas comuns esperados:**
- WhatsApp desconectado
- Evolution API timeout
- Recipient inválido

---

### 3.3. Taxa de envio por cliente (últimos 7 dias)

```sql
SELECT 
  client_id,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  ROUND(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM followup_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY client_id
ORDER BY total_attempts DESC
LIMIT 20;
```

**Objetivo:** Ver quais clientes têm taxa de sucesso baixa (possível problema de config).

**Alerta se:** `success_rate < 80%` para algum cliente ativo.

---

## 4. Análise de Conversas Ativas

### 4.1. Conversas elegíveis para follow-up (agora)

```sql
-- Lead: última mensagem do bot, lead não respondeu, sem appointment
SELECT 
  'lead' as cadence_type,
  COUNT(*) as eligible_count
FROM conversations c
WHERE c.status != 'resolved'
  AND c.last_outgoing_at IS NOT NULL
  AND c.last_incoming_at < c.last_outgoing_at
  AND c.stage NOT IN ('in_service', 'awaiting_human')
  AND NOT EXISTS (
    SELECT 1 FROM appointments a 
    WHERE a.conversation_id = c.id 
      AND a.status = 'scheduled' 
      AND a.start_at > NOW()
  )
  AND NOT EXISTS (
    SELECT 1 FROM followup_cadence_suppressions s
    WHERE s.conversation_id = c.id
      AND s.cadence_type = 'lead'
      AND s.released_at IS NULL
  );
```

**Objetivo:** Quantas conversas deveriam estar recebendo follow-up de lead agora.

---

### 4.2. Conversas com humano ativo

```sql
SELECT 
  stage,
  COUNT(*) as count
FROM conversations
WHERE status != 'resolved'
  AND stage IN ('in_service', 'awaiting_human')
GROUP BY stage
ORDER BY count DESC;
```

**Objetivo:** Ver quantas conversas estão bloqueadas por atendimento humano.

---

### 4.3. Conversas com humano parado (> 24h)

```sql
SELECT 
  COUNT(*) as stagnated_count
FROM conversations c
WHERE c.status != 'resolved'
  AND c.stage IN ('in_service', 'awaiting_human')
  AND c.last_outgoing_by = 'human'
  AND c.last_outgoing_at < NOW() - INTERVAL '24 hours'
  AND (c.last_incoming_at IS NULL OR c.last_incoming_at < c.last_outgoing_at);
```

**Objetivo:** Quantificar o "buraco negro" de conversas humanas paradas.

**Problema:** Essas conversas não recebem follow-up e podem estar esquecidas.

---

### 4.4. Conversas resolvidas recentemente (últimas 24h)

```sql
SELECT 
  COUNT(*) as resolved_count
FROM conversations
WHERE status = 'resolved'
  AND resolved_at >= NOW() - INTERVAL '24 hours';
```

**Objetivo:** Ver taxa de resolução diária.

---

## 5. Análise de Appointments

### 5.1. Appointments futuros por status

```sql
SELECT 
  status,
  COUNT(*) as count
FROM appointments
WHERE start_at > NOW()
GROUP BY status
ORDER BY count DESC;
```

**Resultado esperado:**
| status | count |
|---|---|
| scheduled | X |
| confirmed | Y |
| cancelled | Z |

---

### 5.2. Appointments nas próximas 48h (elegíveis para lembretes)

```sql
SELECT 
  COUNT(*) as upcoming_count,
  SUM(CASE WHEN start_at < NOW() + INTERVAL '3 hours' THEN 1 ELSE 0 END) as within_3h
FROM appointments
WHERE status = 'scheduled'
  AND start_at > NOW()
  AND start_at < NOW() + INTERVAL '48 hours';
```

**Objetivo:** Ver quantos appointments devem receber lembretes em breve.

---

## 6. Análise de Supressões

### 6.1. Cadências canceladas atualmente

```sql
SELECT 
  cadence_type,
  COUNT(*) as suppressed_count
FROM followup_cadence_suppressions
WHERE released_at IS NULL
GROUP BY cadence_type
ORDER BY suppressed_count DESC;
```

**Objetivo:** Ver quantas conversas têm follow-up cancelado manualmente.

---

### 6.2. Supressões por motivo (se coluna existir)

```sql
SELECT 
  suppression_reason,
  COUNT(*) as count
FROM followup_cadence_suppressions
WHERE released_at IS NULL
GROUP BY suppression_reason
ORDER BY count DESC;
```

**Nota:** Se coluna `suppression_reason` não existir, skip.

---

## 7. Análise de Configuração por Cliente

### 7.1. Clientes com follow-up habilitado

```sql
SELECT 
  COUNT(*) as total_clients,
  SUM(CASE WHEN lead_followup_enabled THEN 1 ELSE 0 END) as lead_enabled,
  SUM(CASE WHEN atendimento_followup_enabled THEN 1 ELSE 0 END) as atendimento_enabled,
  SUM(CASE WHEN followup_enabled THEN 1 ELSE 0 END) as legacy_enabled
FROM panel_bot_config;
```

**Objetivo:** Ver quantos clientes têm cada cadência ativa.

---

### 7.2. Clientes com WhatsApp conectado

```sql
SELECT 
  connection_status,
  COUNT(*) as count
FROM panel_whatsapp_config
GROUP BY connection_status
ORDER BY count DESC;
```

**Resultado esperado:**
| connection_status | count |
|---|---|
| open | X (maioria) |
| disconnected | Y (poucos) |

**Alerta se:** Muitos `disconnected` — follow-up não pode enviar.

---

## 8. Análise de Taxa de Resposta

### 8.1. Conversas que responderam após follow-up (últimos 7 dias)

```sql
WITH sent_followups AS (
  SELECT 
    fcs.conversation_id,
    fcs.sent_at,
    fcs.cadence_type,
    fcs.step_key
  FROM followup_cadence_steps fcs
  WHERE fcs.sent_at >= NOW() - INTERVAL '7 days'
),
responses AS (
  SELECT 
    sf.conversation_id,
    sf.sent_at as followup_sent_at,
    sf.cadence_type,
    sf.step_key,
    MIN(m.created_at) as first_response_at,
    EXTRACT(EPOCH FROM (MIN(m.created_at) - sf.sent_at)) / 3600 as hours_to_response
  FROM sent_followups sf
  JOIN messages m ON m.conversation_id = sf.conversation_id
  WHERE m.sender_type = 'lead'
    AND m.created_at > sf.sent_at
    AND m.created_at < sf.sent_at + INTERVAL '48 hours'
  GROUP BY sf.conversation_id, sf.sent_at, sf.cadence_type, sf.step_key
)
SELECT 
  cadence_type,
  step_key,
  COUNT(*) as sent_count,
  SUM(CASE WHEN first_response_at IS NOT NULL THEN 1 ELSE 0 END) as response_count,
  ROUND(SUM(CASE WHEN first_response_at IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as response_rate,
  ROUND(AVG(hours_to_response), 2) as avg_hours_to_response
FROM sent_followups sf
LEFT JOIN responses r ON r.conversation_id = sf.conversation_id AND r.followup_sent_at = sf.sent_at
GROUP BY cadence_type, step_key
ORDER BY cadence_type, step_key;
```

**Objetivo:** Calcular taxa de resposta por step — métrica principal de efetividade.

**Análise esperada:**
- Lead D1 deve ter maior taxa de resposta que D7
- Agendado -3h deve ter alta taxa (confirmações)

---

## 9. Verificação de Integridade de Dados

### 9.1. Steps sem conversa vinculada

```sql
SELECT COUNT(*) as orphan_steps
FROM followup_cadence_steps fcs
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c WHERE c.id = fcs.conversation_id
);
```

**Resultado esperado:** 0 (constraint FK deve prevenir)

---

### 9.2. Conversas sem contact_id

```sql
SELECT COUNT(*) as conversations_without_contact
FROM conversations
WHERE status != 'resolved'
  AND contact_id IS NULL;
```

**Problema:** Conversas sem contact não podem receber follow-up.

---

### 9.3. Contacts sem telefone ou identifier

```sql
SELECT COUNT(*) as contacts_without_channel
FROM contacts
WHERE (phone_number IS NULL OR phone_number = '')
  AND (identifier IS NULL OR identifier = '');
```

**Problema:** Contacts sem canal de comunicação não podem receber mensagens.

---

## 10. Análise de Performance de Cron

### 10.1. Volume de steps por dia (últimos 30 dias)

```sql
SELECT 
  DATE(sent_at) as date,
  cadence_type,
  COUNT(*) as steps_sent
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(sent_at), cadence_type
ORDER BY date DESC, cadence_type;
```

**Objetivo:** Ver tendência de envios — está crescendo, estável ou caindo?

---

### 10.2. Pico de envios por hora do dia

```sql
SELECT 
  EXTRACT(HOUR FROM sent_at) as hour_of_day,
  COUNT(*) as total_steps,
  ROUND(AVG(COUNT(*)) OVER (), 2) as avg_per_hour
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM sent_at)
ORDER BY hour_of_day;
```

**Objetivo:** Ver se há sobrecarga em horários específicos.

---

## 11. Checklist de Validação

Execute as queries acima e preencha:

### Dados gerais

- [ ] Total de steps enviados: ______
- [ ] Conversas únicas com follow-up: ______
- [ ] Taxa de resposta média (lead): _____%
- [ ] Taxa de resposta média (atendimento): _____%
- [ ] Taxa de resposta média (agendado): _____%

### Problemas encontrados

- [ ] Duplicações detectadas? Sim / Não — Quantidade: ______
- [ ] Steps órfãos (sem conversa)? Sim / Não — Quantidade: ______
- [ ] Conversas sem contact_id? Sim / Não — Quantidade: ______
- [ ] Contacts sem telefone? Sim / Não — Quantidade: ______
- [ ] Clientes com WhatsApp desconectado? Sim / Não — Quantidade: ______

### Insights operacionais

- [ ] Conversas com humano parado > 24h: ______
- [ ] Cadências suprimidas atualmente: ______
- [ ] Taxa de sucesso de envio < 80%? Sim / Não — Clientes afetados: ______

---

## 12. Queries Adicionais Customizadas

### 12.1. Template para análise de cliente específico

```sql
-- Substitua 'CLIENT_ID_AQUI' pelo UUID do cliente
WITH client_data AS (
  SELECT 
    c.id as conversation_id,
    c.status,
    c.stage,
    c.last_incoming_at,
    c.last_outgoing_at,
    c.last_outgoing_by,
    ct.name as contact_name,
    ct.phone_number
  FROM conversations c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.client_id = 'CLIENT_ID_AQUI'
    AND c.status != 'resolved'
)
SELECT 
  cd.*,
  (SELECT COUNT(*) FROM followup_cadence_steps fcs WHERE fcs.conversation_id = cd.conversation_id) as followup_steps_sent,
  (SELECT MAX(sent_at) FROM followup_cadence_steps fcs WHERE fcs.conversation_id = cd.conversation_id) as last_followup_at
FROM client_data cd
ORDER BY cd.last_outgoing_at DESC NULLS LAST;
```

---

## 13. Recomendações Baseadas em Análise

Após rodar as queries, responda:

### 13.1. Volume de dados é suficiente para análise?

- [ ] Sim — temos histórico robusto
- [ ] Não — sistema está em fase inicial, poucos dados

**Se não:** Baseline atual será referência, mas métricas só serão confiáveis após acumular mais dados.

### 13.2. Existem problemas críticos de dados?

- [ ] Duplicações massivas
- [ ] Muitos clientes com WhatsApp desconectado
- [ ] Alta taxa de falhas de envio
- [ ] Conversas órfãs sem contact

**Se sim:** Priorizar correção antes de implementar novas features.

### 13.3. Taxa de resposta é aceitável?

**Benchmark da indústria:**
- Lead cold: 5-15%
- Lead warm: 20-40%
- Agendado (confirmação): 60-80%

**Se abaixo:** Follow-up pode estar sendo genérico demais ou fora de contexto.

---

## 14. Conclusão

### Próximos passos:

1. ✅ Rodar todas as queries
2. ✅ Preencher checklist
3. ✅ Identificar 3-5 insights principais
4. ✅ Documentar em `FOLLOWUP_BASELINE.md`
5. ✅ Apresentar findings para time

### Prazo:

**Dia 2 da Fase 0** — 2026-05-08

---

**Autor:** CTO ChatSales  
**Revisado por:** —  
**Próxima revisão:** Após implementar Fase 1 (comparar before/after)
