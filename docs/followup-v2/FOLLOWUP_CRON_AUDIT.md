# Auditoria — Validação de Cron Jobs de Follow-up

**Data:** 2026-05-07  
**Fase:** 0 (Diagnóstico)  
**Objetivo:** Auditar funcionamento dos cron jobs que executam follow-ups

---

## 1. Visão Geral

O sistema possui **2 cron jobs** independentes para follow-up:

| Cron | Rota | Frequência recomendada | Cadências |
|---|---|---|---|
| **Cadência** | `/api/cron/followup-cadencia` | 1h | Lead + Atendimento |
| **Agendado** | `/api/cron/followup-agendado` | 5min | Agendado (lembretes) |

---

## 2. Cron: Follow-up Cadência

### 2.1. Endpoint

```
POST /api/cron/followup-cadencia
```

**Autenticação:** Header `Authorization: Bearer ${CRON_SECRET}`

**Timeout:** Depende do volume de conversas (pode levar minutos)

---

### 2.2. Fluxo de execução

```typescript
POST /api/cron/followup-cadencia
  → reconcileOrphanedSteps()     // Limpa steps órfãos (se houver)
  → runLeadCadencePipeline()     // Processa cadência de lead
  → runAtendimentoCadencePipeline() // Processa cadência de atendimento
  → retorna JSON summary
```

**Execução paralela:** Lead e Atendimento rodam em `Promise.all()` — otimização.

---

### 2.3. Response esperado

```json
{
  "ok": true,
  "reconciled": 0,
  "leadClients": 5,
  "leadStepsSent": 12,
  "atendimentoClients": 3,
  "atendimentoStepsSent": 7,
  "skippedOutsideHours": false,
  "errors": []
}
```

**Campos:**
- `reconciled` — steps órfãos removidos (deve ser 0 normalmente)
- `leadClients` — quantos clientes processaram lead
- `leadStepsSent` — steps enviados de lead
- `atendimentoClients` — quantos clientes processaram atendimento
- `atendimentoStepsSent` — steps enviados de atendimento
- `skippedOutsideHours` — se algum cliente skipou por horário

---

### 2.4. Checklist de validação

Execute o cron manualmente e valide:

```bash
curl -X POST https://panel-testeworkflow.yvssrw.easypanel.host/api/cron/followup-cadencia \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

**Validações:**

- [ ] Retorna 200 OK
- [ ] JSON tem `ok: true`
- [ ] `leadStepsSent` ou `atendimentoStepsSent` > 0 (se houver conversas elegíveis)
- [ ] Tempo de resposta < 30s (se não, pode ter timeout)
- [ ] Nenhum erro 500
- [ ] Steps aparecem em `followup_cadence_steps` no Supabase

---

### 2.5. Problemas comuns

| Problema | Sintoma | Causa provável |
|---|---|---|
| 401 Unauthorized | Response vazio ou erro auth | `CRON_SECRET` incorreto |
| 500 Internal Error | JSON com `error` | Bug no código, WhatsApp offline |
| Timeout (> 60s) | Request pendura | Muitas conversas, DB lento |
| `stepsSent: 0` sempre | Nenhum envio | Nenhuma conversa elegível ou todas skipadas |
| `reconciled > 0` | Steps órfãos removidos | Bug em execução anterior |

---

### 2.6. Logs esperados no console

```text
[Cron] Iniciando followup-cadencia
[Followup Lead] Processando cliente ABC...
[Followup Lead] Enviou step lead_D2 para conversation 123
[Followup Atendimento] Processando cliente DEF...
[Cron] followup-cadencia concluído: { leadStepsSent: 3, ... }
```

**Ausência de logs:** Cron não está rodando ou não foi configurado.

---

## 3. Cron: Follow-up Agendado

### 3.1. Endpoint

```
POST /api/cron/followup-agendado
```

**Autenticação:** Header `Authorization: Bearer ${CRON_SECRET}`

**Timeout:** Mais rápido que cadência (poucos appointments por execução)

---

### 3.2. Fluxo de execução

```typescript
POST /api/cron/followup-agendado
  → runAgendadoCadencePipeline()  // Processa lembretes de appointments futuros
  → retorna JSON summary
```

**Diferença:** Não tem reconciliação, não roda em paralelo (só 1 cadência).

---

### 3.3. Response esperado

```json
{
  "ok": true,
  "clients": 4,
  "stepsSent": 8,
  "skippedOutsideHours": false
}
```

**Campos:**
- `clients` — clientes com appointments processados
- `stepsSent` — lembretes enviados (D-2, -3h, -5min)
- `skippedOutsideHours` — se skipou por horário

---

### 3.4. Checklist de validação

```bash
curl -X POST https://panel-testeworkflow.yvssrw.easypanel.host/api/cron/followup-agendado \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

**Validações:**

- [ ] Retorna 200 OK
- [ ] JSON tem `ok: true`
- [ ] `stepsSent > 0` (se houver appointments nas próximas 48h)
- [ ] Tempo de resposta < 10s
- [ ] Steps aparecem em `followup_cadence_steps` com `cadence_type='agendado'`

---

### 3.5. Problemas comuns

| Problema | Sintoma | Causa provável |
|---|---|---|
| `stepsSent: 0` sempre | Nenhum lembrete | Nenhum appointment futuro ou todos já enviados |
| Envio duplicado | Mesmo lembrete enviado 2x | Cron rodou 2x antes do step ser inserido (race condition rara) |
| Lembrete atrasado | -3h enviado depois da hora | Cron não rodou na frequência correta |

---

## 4. Configuração de Cron no EasyPanel

### 4.1. Frequências configuradas

| Cron | Frequência ideal | Configuração sugerida |
|---|---|---|
| followup-cadencia | 1h | `0 * * * *` (todo início de hora) |
| followup-agendado | 5min | `*/5 * * * *` (a cada 5 minutos) |

**Por quê 5min para agendado?**

- Lembrete -5min precisa de precisão
- Se rodar a cada 1h, pode atrasar

---

### 4.2. Como validar se cron está configurado

1. Acessar EasyPanel → Service `testeworkflow` → **Cron Jobs**

2. Verificar se existem 2 jobs:

   | Nome | Comando | Schedule | Status |
   |---|---|---|---|
   | followup-cadencia | `curl POST /api/cron/followup-cadencia` | `0 * * * *` | Enabled |
   | followup-agendado | `curl POST /api/cron/followup-agendado` | `*/5 * * * *` | Enabled |

3. Validar logs de execução recente

---

### 4.3. Configuração manual (se não existir)

```bash
# No EasyPanel, adicionar Cron Job:

# Job 1: Cadência
curl -X POST https://panel-testeworkflow.yvssrw.easypanel.host/api/cron/followup-cadencia \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"

Schedule: 0 * * * *

# Job 2: Agendado
curl -X POST https://panel-testeworkflow.yvssrw.easypanel.host/api/cron/followup-agendado \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"

Schedule: */5 * * * *
```

**Importante:** Incluir `CRON_SECRET` nas variáveis de ambiente do serviço.

---

## 5. Testes Manuais

### 5.1. Teste 1: Executar cron cadência manualmente

```bash
# Terminal local
curl -X POST http://localhost:3000/api/cron/followup-cadencia \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

**Resultado esperado:**
- Status 200
- JSON com summary
- Console mostra logs de processamento

---

### 5.2. Teste 2: Executar cron agendado manualmente

```bash
curl -X POST http://localhost:3000/api/cron/followup-agendado \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

**Resultado esperado:**
- Status 200
- JSON com summary
- Se houver appointments nas próximas 48h, `stepsSent > 0`

---

### 5.3. Teste 3: Validar envio efetivo

1. Executar cron
2. Verificar em `followup_cadence_steps`:
   ```sql
   SELECT * FROM followup_cadence_steps 
   ORDER BY sent_at DESC 
   LIMIT 10;
   ```
3. Verificar se `sent_at` corresponde ao momento da execução
4. Verificar se mensagem chegou no WhatsApp (se possível)

---

## 6. Monitoramento de Saúde

### 6.1. Query para última execução de cada cadência

```sql
SELECT 
  cadence_type,
  MAX(sent_at) as last_execution,
  EXTRACT(EPOCH FROM (NOW() - MAX(sent_at))) / 60 as minutes_ago,
  COUNT(*) as steps_in_last_hour
FROM followup_cadence_steps
WHERE sent_at >= NOW() - INTERVAL '1 hour'
GROUP BY cadence_type;
```

**Alerta se:**
- `last_execution` de Lead/Atendimento > 2h atrás (cron parou)
- `last_execution` de Agendado > 10min atrás (cron parou)

---

### 6.2. Query para taxa de erro no cron

```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_logs,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  ROUND(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as failure_rate
FROM followup_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

**Alerta se:** `failure_rate > 10%` em qualquer hora.

---

## 7. Reconciliação de Steps Órfãos

### 7.1. O que é reconciliação?

No início de cada execução de `followup-cadencia`, o sistema roda:

```typescript
const reconciled = await reconcileOrphanedSteps()
```

**Objetivo:** Remover steps que foram inseridos mas não resultaram em envio (falha intermediária).

---

### 7.2. Como funciona?

```typescript
async function reconcileOrphanedSteps(): Promise<number> {
  // Busca steps inseridos há mais de 10min sem log correspondente
  const orphans = await db
    .from('followup_cadence_steps')
    .select('id')
    .lt('sent_at', new Date(Date.now() - 10 * 60 * 1000))
    .not.exists(
      db.from('followup_logs')
        .select('id')
        .eq('conversation_id', 'followup_cadence_steps.conversation_id')
        .eq('step_key', 'followup_cadence_steps.step_key')
    )

  if (orphans.length > 0) {
    await db.from('followup_cadence_steps').delete().in('id', orphans.map(o => o.id))
  }

  return orphans.length
}
```

**Lógica:** Step existe em `followup_cadence_steps` mas não existe log em `followup_logs` → remove.

---

### 7.3. Quando isso acontece?

- Crash do servidor após INSERT mas antes de `sendFollowupMessage()`
- Timeout na Evolution API
- Bug no código que não chegou ao envio

---

### 7.4. Validação

**Query para detectar órfãos:**

```sql
SELECT fcs.*
FROM followup_cadence_steps fcs
WHERE fcs.sent_at < NOW() - INTERVAL '10 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM followup_logs fl
    WHERE fl.conversation_id = fcs.conversation_id
      AND fl.step_key = fcs.step_key
  );
```

**Resultado esperado:** 0 linhas (nenhum órfão)

**Se encontrar órfãos:** Investigar por que o envio falhou silenciosamente.

---

## 8. Retry e Circuit Breaker

### 8.1. O cron tem retry automático?

**Não.** Se uma execução falhar, aguarda próxima execução.

**Implicação:** Se cron de 1h falhar, próxima tentativa é só 1h depois.

---

### 8.2. Circuit Breaker

**Implementado em:** `FollowupCircuitBreaker` (em `shared.ts`)

**Lógica:**
- Após **3 falhas consecutivas** de envio para um cliente, abre circuito
- Circuito aberto = pula todas as conversas restantes desse cliente
- Próxima execução do cron tenta novamente

**Objetivo:** Evitar tentativas em massa quando WhatsApp está offline.

---

### 8.3. Validação do Circuit Breaker

**Cenário de teste:**

1. Desconectar WhatsApp de um cliente
2. Executar cron
3. Ver logs: `[Followup] circuit_open para clientId=X`
4. Verificar que conversas desse cliente foram puladas

**Query para ver circuit breaks:**

```sql
SELECT 
  client_id,
  COUNT(*) as failed_attempts
FROM followup_logs
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY client_id
HAVING COUNT(*) >= 3;
```

---

## 9. Performance e Escalabilidade

### 9.1. Tempo de execução atual

**Testar localmente:**

```bash
time curl -X POST http://localhost:3000/api/cron/followup-cadencia \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

**Resultado esperado:**
- < 5s para 1-5 clientes
- < 30s para 10-20 clientes
- < 60s para 50+ clientes

**Se > 60s:** Risco de timeout no cron.

---

### 9.2. Otimizações implementadas

| Otimização | Local | Benefício |
|---|---|---|
| `Promise.all()` | Lead + Atendimento em paralelo | 2x mais rápido |
| `LIMIT 500` | Query de conversas | Previne timeout |
| Circuit breaker | Pula cliente com falhas | Evita tentativas em massa |
| Idempotência | `ON CONFLICT DO NOTHING` | Cron pode rodar 2x sem duplicar |

---

### 9.3. Gargalos conhecidos

| Gargalo | Sintoma | Mitigação |
|---|---|---|
| Query de conversas lenta | Timeout no cron | Adicionar índices em `last_outgoing_at`, `stage` |
| Muitas conversas elegíveis | Timeout | Processar em batches, não tudo de uma vez |
| Evolution API lenta | Timeout | Aumentar timeout ou usar fila |

---

## 10. Logs e Debugging

### 10.1. Onde ver logs de execução?

**Produção (EasyPanel):**
- Acessar Service `testeworkflow` → **Logs**
- Filtrar por `[Cron]` ou `[Followup]`

**Local:**
- Console do terminal rodando `npm run dev`

---

### 10.2. Logs esperados em execução saudável

```text
[Cron] Iniciando followup-cadencia
[Followup Lead] Processando cliente 3feeb364-86f6-4a2e-9b27-450f69d25752
[Followup Lead] Conversa elegível: 456, step: lead_D2
[Followup Lead] Enviou step lead_D2 para conversation 456
[Followup Atendimento] Processando cliente 3feeb364-86f6-4a2e-9b27-450f69d25752
[Followup Atendimento] Sem conversas elegíveis
[Cron] followup-cadencia concluído: { leadStepsSent: 1, atendimentoStepsSent: 0 }
```

---

### 10.3. Logs de erro

```text
[Followup Lead] Erro para conversation=789: WhatsApp instance not connected
[Followup Lead] Circuit breaker aberto para clientId=ABC
[Cron] Erro no followup-cadencia: Database connection timeout
```

---

## 11. Checklist de Validação Completa

### 11.1. Pré-requisitos

- [ ] `CRON_SECRET` configurado em EasyPanel
- [ ] Variáveis de ambiente Evolution API (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`)
- [ ] Supabase conectado e acessível

### 11.2. Validações de configuração

- [ ] Cron `followup-cadencia` configurado no EasyPanel (schedule: `0 * * * *`)
- [ ] Cron `followup-agendado` configurado no EasyPanel (schedule: `*/5 * * * *`)
- [ ] Ambos os crons estão **Enabled**
- [ ] Última execução de cada cron < 2h atrás (ver logs)

### 11.3. Validações de execução

- [ ] Executar manualmente `/api/cron/followup-cadencia` → retorna 200
- [ ] Executar manualmente `/api/cron/followup-agendado` → retorna 200
- [ ] Steps aparecem em `followup_cadence_steps` após execução
- [ ] Logs aparecem em `followup_logs` com `status='sent'`
- [ ] Nenhum step órfão detectado (`reconciled: 0`)

### 11.4. Validações de performance

- [ ] Tempo de execução `followup-cadencia` < 30s
- [ ] Tempo de execução `followup-agendado` < 10s
- [ ] Taxa de falha nos logs < 10%
- [ ] Circuit breaker funciona (testar com WhatsApp offline)

---

## 12. Problemas Conhecidos e Soluções

### 12.1. "Cron não está rodando"

**Sintomas:**
- Nenhum step enviado nas últimas 2h
- Logs silenciosos

**Checklist:**
1. Verificar se cron está configurado no EasyPanel
2. Verificar se cron está **Enabled**
3. Ver logs do EasyPanel para erros de execução
4. Testar execução manual com curl

---

### 12.2. "Steps duplicados"

**Sintomas:**
- Mesmo step enviado 2x ou mais

**Causas:**
- Constraint `UNIQUE` não existe (migration 004 não rodou)
- Race condition: 2 crons rodaram simultaneamente

**Solução:**
1. Validar constraint existe:
   ```sql
   SELECT constraint_name 
   FROM information_schema.table_constraints 
   WHERE table_name = 'followup_cadence_steps' 
     AND constraint_type = 'UNIQUE';
   ```
2. Se não existe, rodar migration 004
3. Garantir que crons não executem simultaneamente

---

### 12.3. "Timeout no cron"

**Sintomas:**
- Execução nunca completa
- Logs param no meio

**Solução:**
1. Reduzir `LIMIT` da query de conversas (de 500 para 100)
2. Processar em batches menores
3. Adicionar índices em `conversations`:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_conversations_last_outgoing 
   ON conversations(client_id, last_outgoing_at) 
   WHERE status != 'resolved';
   ```

---

## 13. Conclusão

### O que funciona:

- ✅ 2 crons separados (cadência 1h, agendado 5min)
- ✅ Autenticação via `CRON_SECRET`
- ✅ Reconciliação de órfãos
- ✅ Circuit breaker
- ✅ Idempotência

### O que precisa validar:

- ⚠️ Crons estão configurados no EasyPanel?
- ⚠️ Frequência de execução está correta?
- ⚠️ Performance é aceitável com volume atual?
- ⚠️ Logs estão acessíveis e úteis?

### Próximo passo:

Executar testes manuais e preencher checklist.

---

**Autor:** CTO ChatSales  
**Revisado por:** —  
**Próxima revisão:** Fase 1 (após adicionar eventos, validar se cron registra corretamente)
