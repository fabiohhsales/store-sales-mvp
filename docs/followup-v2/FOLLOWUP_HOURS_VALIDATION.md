# Follow-up — Validação de Horários Comerciais

**Data:** 2026-05-07  
**Fase:** 0 (Diagnóstico)  
**Objetivo:** Validar funcionamento de `isWithinWorkingHours()` e detecção de horário comercial

---

## 1. Visão Geral

O sistema utiliza a função `isWithinWorkingHours()` para determinar se o follow-up deve ser enviado naquele momento.

**Localização:** `src/lib/followup/business-hours.ts`

**Chamado em:**
- `lead-cadence.ts` (linha 98)
- `atendimento-cadence.ts` (linha 156)
- `agendado-cadence.ts` (linha 117)
- `confirmations.ts` (linha 283)

---

## 2. Como Funciona

### 2.1. Assinatura

```typescript
export function isWithinWorkingHours(
  workingHours: WorkingHours | null | undefined,
  timezone: string,
  now: Date = new Date()
): boolean
```

**Parâmetros:**
- `workingHours` — JSONB vindo de `panel_bot_config.working_hours`
- `timezone` — ex: `'America/Sao_Paulo'`, `'Europe/Athens'`
- `now` — timestamp para testar (default = agora)

**Retorna:**
- `true` — está dentro do horário comercial
- `false` — fora do horário, deve skip

---

### 2.2. Estrutura de `working_hours`

```jsonb
{
  "monday": {
    "enabled": true,
    "start": "08:00",
    "end": "18:00",
    "break_start": "12:00",
    "break_end": "13:00"
  },
  "tuesday": { ... },
  "wednesday": { ... },
  "thursday": { ... },
  "friday": { ... },
  "saturday": {
    "enabled": false,
    "start": "00:00",
    "end": "00:00",
    "break_start": null,
    "break_end": null
  },
  "sunday": { ... }
}
```

**Regras:**
- `enabled: false` → skip sempre
- `start` inclusive, `end` exclusive
- `break_start` inclusive, `break_end` exclusive

---

### 2.3. Política Fail-Closed

**Se `working_hours` for `null` ou `undefined` → retorna `false`**

**Motivo:** Prevenir envios acidentais à meia-noite quando bot config está incompleto ou em provisionamento.

---

## 3. Algoritmo de Validação

```typescript
1. Se `workingHours` é null/undefined → return false
2. Detectar dia da semana no timezone (via Intl.DateTimeFormat)
3. Buscar `day` (ex: `workingHours.monday`)
4. Se `day.enabled` é false → return false
5. Parsear `start` e `end` (formato HH:MM)
6. Se `end <= start` (inválido) → return false
7. Calcular minutos do dia no timezone (ex: 09:30 = 570 minutos)
8. Se `current < start` ou `current >= end` → return false
9. Se existe break, validar se está dentro do break
10. Se passou todos os checks → return true
```

---

## 4. Testes Unitários Existentes

**Arquivo:** `tests/business-hours.test.ts`

### 4.1. Casos cobertos

| Teste | Horário | Resultado esperado |
|---|---|---|
| Segunda 09:00 BRT | 08:00–18:00 window | ✅ true |
| Segunda 07:30 BRT | Antes do `start` | ❌ false |
| Segunda 18:30 BRT | Após `end` | ❌ false |
| Domingo 12:00 BRT | Dia desabilitado | ❌ false |
| Segunda 12:30 BRT | Dentro do break (12:00–13:00) | ❌ false |
| Segunda 08:00 BRT | Exato no `start` | ✅ true (inclusive) |
| Segunda 18:00 BRT | Exato no `end` | ❌ false (exclusive) |
| Segunda 12:00 BRT | Exato no `break_start` | ❌ false (inclusive) |
| Segunda 13:00 BRT | Exato no `break_end` | ✅ true (exclusive) |
| `workingHours` null | Fail-closed | ❌ false |
| `workingHours` undefined | Fail-closed | ❌ false |
| Timezone diferente | Athens vs. Sao_Paulo | ✅ Respeita cada TZ |
| DST (horário de verão) | Europa após spring-forward | ✅ Detecta corretamente |
| `end <= start` | Bounds inválidos | ❌ false (validação) |

**Todos os testes passam:** ✅ 14/14

---

## 5. Edge Cases Validados

### 5.1. Timezones com DST (Daylight Saving Time)

**Teste:**
```typescript
// 2026-03-30 é o primeiro dia após spring-forward na Europa/Athens
// 09:30 local = 06:30 UTC (EEST, +03:00)
const monAfterSpringForward = new Date('2026-03-30T06:30:00Z')
expect(
  isWithinWorkingHours(hours, 'Europe/Athens', monAfterSpringForward)
).toBe(true)
```

**Status:** ✅ Passa — DST é tratado nativamente via `Intl.DateTimeFormat`

---

### 5.2. Meia-noite (24:00 vs 00:00)

Algumas locales retornam `"24"` para meia-noite. Normalizado para `0` no código:

```typescript
const rawHour = parts.hour === '24' ? '0' : parts.hour
```

**Status:** ✅ Tratado

---

### 5.3. Boundaries (start/end, break start/end)

| Boundary | Behavior | Validado |
|---|---|---|
| `start` | Inclusive | ✅ |
| `end` | Exclusive | ✅ |
| `break_start` | Inclusive | ✅ |
| `break_end` | Exclusive | ✅ |

---

## 6. Problemas Conhecidos e Limitações

### 6.1. Não suporta horários noturnos (cross-midnight)

**Exemplo:** `start: "20:00"`, `end: "02:00"` (passa da meia-noite)

**Comportamento atual:** `end <= start` → return `false`

**Solução futura:** Implementar lógica de wrap-around ou split em 2 dias.

**Prioridade:** Baixa (clientes não usam horário noturno hoje)

---

### 6.2. Não valida formato "HH:MM" rigorosamente

**Aceita:** `"8:00"` (1 dígito) ou `"08:00"` (2 dígitos)

**Regex:** `^(\d{1,2}):(\d{2})$`

**Problema potencial:** `"99:99"` seria parseado (mas geraria minutes inválidos)

**Status:** Aceito — DB validation deve prevenir valores inválidos

---

### 6.3. Não tem cache

Cada chamada faz parsing de timezone + `working_hours`.

**Impacto:** Baixo (funções Intl são rápidas)

**Otimização futura:** Cachear result por `(clientId, hour)` se performance for problema.

---

## 7. Validação Manual

### 7.1. Teste local com timestamp customizado

```typescript
import { isWithinWorkingHours } from '@/lib/followup/business-hours'

const workingHours = {
  monday: {
    enabled: true,
    start: '08:00',
    end: '18:00',
    break_start: '12:00',
    break_end: '13:00',
  },
  // ... outros dias
}

// Testar Segunda 09:00 BRT
const testDate = new Date('2026-04-06T12:00:00Z') // 09:00 BRT
console.log(isWithinWorkingHours(workingHours, 'America/Sao_Paulo', testDate))
// Esperado: true

// Testar Domingo 12:00 BRT
const sundayDate = new Date('2026-04-05T15:00:00Z') // 12:00 BRT Sun
console.log(isWithinWorkingHours(workingHours, 'America/Sao_Paulo', sundayDate))
// Esperado: false
```

---

### 7.2. Teste com cliente real (ChoiExpert)

**Cliente:** ChoiExpert Hair Clinic  
**Timezone:** `Europe/Athens` (EEST, +03:00 no verão)

**Query:**
```sql
SELECT working_hours, timezone
FROM panel_bot_config
WHERE client_id = '3feeb364-86f6-4a2e-9b27-450f69d25752';
```

**Teste:**
1. Pegar `working_hours` do DB
2. Executar função com horários diferentes:
   - Segunda 09:00 Athens (dentro)
   - Domingo 12:00 Athens (fora)
   - Segunda 13:00 Athens durante break (fora)

---

## 8. Integração com Cron

### 8.1. Onde é chamado

```typescript
// lead-cadence.ts, linha 98
if (!isWithinWorkingHours(ctx.botConfig.working_hours, ctx.botConfig.timezone ?? 'America/Sao_Paulo')) {
  logFollowupSkip('lead', 'fora_do_horario', { clientId: ctx.clientId })
  return { stepsSent: 0, skippedOutsideHours: true }
}
```

**Mesmo padrão em:**
- `atendimento-cadence.ts`
- `agendado-cadence.ts`

---

### 8.2. Comportamento quando fora do horário

1. Skip todo o processamento para aquele cliente
2. Log: `[Followup lead] skip reason=fora_do_horario { clientId: ... }`
3. Retorna `skippedOutsideHours: true` no summary
4. Próxima execução do cron (1h depois) tenta novamente

**Não acumula fila:** Se cron roda às 07h (fora do horário), não envia depois.

---

## 9. Validações Recomendadas

### 9.1. Query para detectar clientes sem `working_hours`

```sql
SELECT 
  pc.id as client_id,
  pc.name,
  pbc.working_hours,
  pbc.timezone
FROM panel_clients pc
JOIN panel_bot_config pbc ON pbc.client_id = pc.id
WHERE pc.status = 'active'
  AND (pbc.working_hours IS NULL OR pbc.timezone IS NULL);
```

**Resultado esperado:** 0 linhas

**Se encontrar:** Esses clientes nunca receberão follow-up (fail-closed policy).

---

### 9.2. Query para validar formato de `working_hours`

```sql
SELECT 
  pc.name,
  pbc.working_hours
FROM panel_clients pc
JOIN panel_bot_config pbc ON pbc.client_id = pc.id
WHERE pc.status = 'active'
  AND pbc.working_hours IS NOT NULL;
```

**Validar manualmente:**
- Todos os dias da semana presentes?
- `start` e `end` no formato `HH:MM`?
- `enabled` é boolean?

---

### 9.3. Teste de extremos

| Cenário | Horário | Esperado |
|---|---|---|
| Cron roda 07:00 (antes do start) | Fora do horário | Skip todos os clientes |
| Cron roda 09:00 (dentro) | Horário normal | Processar normalmente |
| Cron roda 12:30 (break) | Dentro do break | Skip todos os clientes |
| Cron roda 18:00 (exato no end) | Exclusive boundary | Skip |
| Cron roda 18:01 (após end) | Fora do horário | Skip |

---

## 10. Logs Esperados

### 10.1. Log de skip por horário

```text
[Followup lead] skip reason=fora_do_horario { clientId: '3feeb364-86f6-4a2e-9b27-450f69d25752' }
```

**Onde:** Console do servidor (logs do EasyPanel)

---

### 10.2. Query para contar skips por horário (últimos 7 dias)

```sql
-- Nota: Esta query só funciona se followup_logs tiver coluna `skip_reason`
-- Se não existir, implementar na Fase 1

SELECT 
  DATE(created_at) as day,
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as skip_count
FROM followup_logs
WHERE status = 'skipped'
  AND skip_reason = 'fora_do_horario'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at)
ORDER BY day DESC, hour;
```

**Análise esperada:**
- Picos de skip antes das 08:00 (antes do start)
- Picos de skip após 18:00 (após end)
- Picos de skip entre 12:00–13:00 (break)

---

## 11. Comparação com Sistema Legado

### 11.1. Antes (hardcoded)

```typescript
// Legacy em confirmations.ts
const hour = new Date().getHours()
if (hour < 8 || hour >= 17) {
  skip()
}
```

**Problemas:**
- Não respeita timezone do cliente
- Não permite configuração por cliente
- Hardcoded 08:00–17:00
- Não suporta break

---

### 11.2. Agora (per-client, timezone-aware)

```typescript
isWithinWorkingHours(
  ctx.botConfig.working_hours,
  ctx.botConfig.timezone ?? 'America/Sao_Paulo'
)
```

**Melhorias:**
- ✅ Configurável por cliente
- ✅ Suporta qualquer timezone (DST-aware)
- ✅ Suporta break (almoço)
- ✅ Dias da semana individuais (ex: sábado desabilitado)
- ✅ Fail-closed (safe default)

---

## 12. Próximas Melhorias (Fase 5)

### 12.1. Horários dinâmicos por urgência

**Ideia:** Permitir que mensagens urgentes (ex: confirmação -3h de appointment) ignorem `working_hours`.

**Implementação:**
```typescript
if (urgencyLevel === 'critical') {
  // Bypass working hours check
  return true
}
```

**Prioridade:** Baixa — aguardar feedback de clientes

---

### 12.2. Feriados

**Problema:** Sistema não detecta feriados (ex: Natal, Ano Novo).

**Solução futura:**
- Adicionar tabela `panel_holidays` com `client_id`, `date`, `name`
- Modificar `isWithinWorkingHours()` para skip em feriados

**Prioridade:** Média

---

## 13. Checklist de Validação

### 13.1. Testes unitários

- [x] Testes existem (`tests/business-hours.test.ts`)
- [x] Todos os 14 testes passam
- [x] Edge cases cobertos (DST, boundaries, fail-closed)

### 13.2. Integração

- [ ] Executar cron às 07:00 (fora do horário) → validar skip
- [ ] Executar cron às 09:00 (dentro) → validar envio
- [ ] Executar cron às 12:30 (break) → validar skip
- [ ] Ver logs: `skip reason=fora_do_horario` aparecem?

### 13.3. Produção

- [ ] Query: clientes sem `working_hours` → 0 resultados
- [ ] Query: formato de `working_hours` válido → todos corretos
- [ ] Logs de produção mostram skips esperados nos horários corretos

---

## 14. Problemas em Produção (Histórico)

### 14.1. Nenhum problema reportado até o momento

**Status:** ✅ Função está funcionando conforme esperado

**Monitoramento:** Continuar observando logs de skip por `fora_do_horario`

---

## 15. Conclusão

### O que funciona:

- ✅ Detecção correta de horário comercial por cliente
- ✅ Timezone-aware com DST
- ✅ Boundaries (start/end, break) corretos
- ✅ Fail-closed (safe default)
- ✅ Testes unitários completos

### Limitações conhecidas:

- ⚠️ Não suporta horários noturnos (cross-midnight)
- ⚠️ Não detecta feriados
- ⚠️ Não permite urgência bypass

### Recomendações:

1. ✅ Manter implementação atual — está sólida
2. ✅ Adicionar coluna `skip_reason` em `followup_logs` (Fase 1)
3. ⏸️ Horários noturnos — aguardar demanda de clientes
4. ⏸️ Feriados — implementar se clientes reportarem problema

---

**Autor:** CTO ChatSales  
**Revisado por:** —  
**Testes:** ✅ 14/14 passando  
**Status:** Produção-ready
