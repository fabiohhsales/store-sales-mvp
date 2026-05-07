# Auditoria — Pontos de Skip de Follow-up

**Data:** 2026-05-07  
**Fase:** 0 (Diagnóstico)  
**Objetivo:** Mapear todos os motivos pelos quais uma conversa NÃO recebe follow-up

---

## 1. Visão Geral

Um skip acontece quando o sistema avalia uma conversa para follow-up mas decide não enviar. Existem **skips explícitos** (logados) e **skips implícitos** (filtros silenciosos).

---

## 2. Skips por Cadência

### 2.1. Lead Cadence

#### 2.1.1. Skips globais (pré-query)

| Código | Função | Local | Motivo |
|---|---|---|---|
| `fora_do_horario` | `isWithinWorkingHours()` | Início de `processClient()` | Hora atual não está dentro de `working_hours` |
| `no_enabled_steps` | `resolveLeadSteps()` | Após resolução de steps | Nenhum step com `enabled: true` |
| `sem_conversas` | Query retorna vazio | Após `queryLeadConversations()` | Nenhuma conversa ativa sem `resolved` |
| `sem_candidatos_pos_filtro` | Após filtro de agendamento | Após `queryConversationsWithScheduledAppointment()` | Todas as conversas têm appointment futuro |

#### 2.1.2. Skips por conversa

| Código | Condição | Local | Motivo |
|---|---|---|---|
| `em_atendimento_humano` | `stage IN ('in_service', 'awaiting_human')` | Loop de conversas | Operador assumiu ou está atendendo |
| `sem_contato_ou_last_outgoing` | `!last_outgoing_at OR !contact_id` | Loop de conversas | Dados básicos faltando |
| `sem_step_elegivel` | `resolveLeadStepKey()` retorna null | Loop de conversas | Nenhum step corresponde à janela de tempo |
| `contato_nao_encontrado` | `contactsMap.get(contact_id)` retorna undefined | Loop de conversas | Contact foi deletado/não existe |
| _(silencioso)_ | `!recipient` (identifier ou phone_number) | Loop de conversas | Sem telefone/identifier |
| _(silencioso)_ | Conversa em `suppressedConversations` Set | Filtro pós-query | Cadência cancelada manualmente |
| _(silencioso)_ | `last_incoming_at >= last_outgoing_at` | Filtro pós-query | Lead respondeu depois do bot |
| _(silencioso)_ | Step já enviado (conflict na INSERT) | `sendFollowupMessage()` | Idempotência |
| `whatsapp_desconectado` | `!isWhatsAppConnected()` | `sendFollowupMessage()` | Instância Evolution offline |
| `circuit_open` | Circuit breaker aberto | Início do loop | 3+ falhas consecutivas de envio |

---

### 2.2. Atendimento Cadence

#### 2.2.1. Skips globais (idênticos ao Lead)

| Código | Função | Motivo |
|---|---|---|
| `fora_do_horario` | `isWithinWorkingHours()` | Fora do horário comercial |
| `no_enabled_steps` | `resolveAtendimentoSteps()` | Nenhum step ativo |
| `sem_conversas` | Query retorna vazio | Nenhuma conversa com `last_outgoing_by='human'` |
| `sem_candidatos_pos_filtro` | Após filtro de agendamento | Todas as conversas agendadas |

#### 2.2.2. Skips por conversa (idênticos ao Lead)

| Código | Condição | Motivo |
|---|---|---|
| `em_atendimento_humano` | `stage IN ('in_service', 'awaiting_human')` | Operador assumiu |
| `sem_contato_ou_last_outgoing` | Dados básicos faltando | — |
| `sem_step_elegivel` | Nenhum step na janela | — |
| `contato_nao_encontrado` | Contact não existe | — |
| _(silencioso)_ | Sem telefone | — |
| _(silencioso)_ | Suprimido | Cadência cancelada |
| _(silencioso)_ | Lead respondeu | `last_incoming_at >= last_outgoing_at` |
| _(silencioso)_ | Step já enviado | Idempotência |
| `whatsapp_desconectado` | Evolution offline | — |
| `circuit_open` | Circuit breaker | — |

#### 2.2.3. Filtro específico de Atendimento

| Filtro | Local | Motivo |
|---|---|---|
| `last_outgoing_by != 'human'` | WHERE clause da query | Só envia follow-up se humano falou por último |
| `last_incoming_at >= last_outgoing_at` | Filtro pós-query | Lead já respondeu após o humano |

**Implicação:** Se bot ou IA enviar mensagem, conversa sai da cadência de atendimento (não é mais `last_outgoing_by='human'`)

---

### 2.3. Agendado Cadence

#### 2.3.1. Skips globais

| Código | Função | Motivo |
|---|---|---|
| `fora_do_horario` | `isWithinWorkingHours()` | Fora do horário comercial |
| `no_enabled_steps` | `resolveAgendadoSteps()` | Nenhum step ativo |
| `sem_appointments` | Query retorna vazio | Nenhum appointment futuro nos próximos 3 dias |

#### 2.3.2. Skips por appointment

| Código | Condição | Motivo |
|---|---|---|
| _(silencioso)_ | `stage IN ('in_service', 'awaiting_human')` | Operador assumiu |
| _(silencioso)_ | `!contact_id` | Sem contato vinculado |
| _(silencioso)_ | Appointment em `suppressedConversations` | Lembrete cancelado |
| `sem_step_elegivel` | Nenhum step na janela antes do appointment | Hora não corresponde |
| `contato_nao_encontrado` | Contact não existe | — |
| _(silencioso)_ | Sem telefone | — |
| _(silencioso)_ | Step já enviado | Idempotência |
| `whatsapp_desconectado` | Evolution offline | — |
| `circuit_open` | Circuit breaker | — |

---

## 3. Matriz Consolidada de Motivos

### 3.1. Skips técnicos (infra/config)

| Motivo | Lead | Atendimento | Agendado | Gravidade |
|---|---|---|---|---|
| WhatsApp desconectado | ✅ | ✅ | ✅ | 🔴 Alta |
| Circuit breaker aberto | ✅ | ✅ | ✅ | 🔴 Alta |
| Nenhum step habilitado | ✅ | ✅ | ✅ | 🟡 Média |
| Fora do horário comercial | ✅ | ✅ | ✅ | 🟢 Baixa |

### 3.2. Skips de dados

| Motivo | Lead | Atendimento | Agendado | Gravidade |
|---|---|---|---|---|
| Contact não encontrado | ✅ | ✅ | ✅ | 🟡 Média |
| Sem telefone/identifier | ✅ | ✅ | ✅ | 🟡 Média |
| Sem contact_id | ✅ | ✅ | ✅ | 🟡 Média |
| Sem last_outgoing_at | ✅ | ✅ | — | 🟡 Média |

### 3.3. Skips de regra de negócio

| Motivo | Lead | Atendimento | Agendado | Gravidade |
|---|---|---|---|---|
| Stage: in_service/awaiting_human | ✅ | ✅ | ✅ | 🟢 Baixa (esperado) |
| Já tem appointment futuro | ✅ | ✅ | — | 🟢 Baixa (esperado) |
| Lead respondeu recentemente | ✅ | ✅ | — | 🟢 Baixa (esperado) |
| Cadência suprimida manualmente | ✅ | ✅ | ✅ | 🟢 Baixa (esperado) |
| Step já enviado (idempotência) | ✅ | ✅ | ✅ | 🟢 Baixa (esperado) |

### 3.4. Skips de janela de tempo

| Motivo | Lead | Atendimento | Agendado | Gravidade |
|---|---|---|---|---|
| Sem step elegível para a janela atual | ✅ | ✅ | ✅ | 🟡 Média (pode ser esperado) |
| Nenhuma conversa candidata pós-filtros | ✅ | ✅ | — | 🟢 Baixa (esperado) |

---

## 4. Análise de Visibilidade

### 4.1. Skips logados explicitamente

**Via `logFollowupSkip()`:**
- `fora_do_horario`
- `sem_conversas`
- `sem_candidatos_pos_filtro`
- `em_atendimento_humano`
- `sem_contato_ou_last_outgoing`
- `sem_step_elegivel`
- `contato_nao_encontrado`
- `whatsapp_desconectado`

**Via `logFollowupEvent()`:**
- `no_enabled_steps` (event_type='skipped')
- `circuit_open` (event_type='circuit_open')

**Local do log:** Console + `followup_logs` (alguns casos)

**Problema:** Logs não são acessíveis para operadores. Sem UI para visualizar.

### 4.2. Skips silenciosos (não logados)

- Conversa suprimida (filtro pós-query)
- Lead respondeu recentemente (filtro pós-query)
- Sem telefone/identifier (continue sem log)
- Step já enviado (idempotência, return false silencioso)
- Stage `in_service`/`awaiting_human` em Agendado (filtro pré-iteração)
- Contact sem `contact_id` em Agendado (filtro pré-iteração)

**Problema:** Operador não sabe que essas conversas foram avaliadas e ignoradas.

---

## 5. Problemas Identificados

### 5.1. Invisibilidade de decisões

**Cenário:** Operador abre conversa e pergunta "por que não recebeu follow-up?"

**Hoje:** Precisa:
1. Olhar logs do servidor (se tiver acesso)
2. Checar manualmente se stage está `in_service`
3. Checar se existe appointment futuro
4. Checar se WhatsApp está conectado
5. Checar se horário está dentro de working_hours
6. Calcular se existe step elegível para a janela

**Tempo:** ~5-10 minutos de investigação

**Ideal:** Card no Desk mostra "Follow-up bloqueado: conversa em atendimento humano"

---

### 5.2. Skips não diferenciados

Todos os skips são tratados igual, mas deveriam ter severidades diferentes:

| Severidade | Exemplos | Ação esperada |
|---|---|---|
| 🔴 **Crítico** | WhatsApp desconectado, circuit breaker | Alerta imediato para admin |
| 🟡 **Atenção** | Contact não encontrado, sem telefone | Revisar dados |
| 🟢 **Normal** | Fora do horário, lead respondeu, humano ativo | Esperado |

---

### 5.3. Humano ativo é buraco negro

**Problema:**
- `stage = 'in_service'` bloqueia follow-up ✅ (correto)
- Mas se operador fica parado 24h, conversa fica bloqueada indefinidamente ❌ (problema)

**Hoje não existe:**
- Detecção de "humano parado há X horas"
- Alerta para operador
- Retomada automática ou sugerida

---

### 5.4. Falta priorização de skips

Se uma conversa tem múltiplos motivos de skip, qual aparece?

**Exemplo:**
- Stage = `in_service` (skip A)
- WhatsApp desconectado (skip B)
- Nenhum step elegível (skip C)

**Hoje:** O primeiro check que falhar determina o skip

**Problema:** Skip menos grave pode esconder skip mais grave

**Ideal:** Priorizar por gravidade: crítico > atenção > normal

---

### 5.5. Last outgoing_by não é sempre confiável

**Problema crítico para Atendimento Cadence:**

Se mensagem humana não for marcada como `last_outgoing_by='human'`, a conversa não entra na cadência de atendimento mesmo devendo entrar.

**Pontos de falha:**
- Envio via Desk pode esquecer de setar
- Envio via Evolution direto não seta automaticamente
- Mensagens antigas podem não ter o campo

**Risco:** Conversas humanas paradas não recebem follow-up de atendimento

---

### 5.6. Falta contexto da última mensagem

**Problema:** Sistema não distingue:

| Última mensagem do lead | Follow-up adequado? |
|---|---|
| "Quanto custa a consulta?" | ❌ Não (exige resposta humana) |
| "Ok obrigado" | ✅ Sim (pode fazer follow-up) |
| "Estou com muita dor" | ❌ Não (urgente, exige humano) |
| "Vou pensar e te aviso" | ✅ Sim (pode fazer follow-up) |

**Hoje:** Filtro é apenas temporal (`last_incoming_at < last_outgoing_at`)

**Ideal:** IA analisa o conteúdo antes de decidir enviar follow-up genérico

---

## 6. Skips que Deveriam Existir (mas não existem)

### 6.1. Análise de sentimento negativo

**Hoje:** Não existe

**Deveria:** Se última mensagem do lead demonstra frustração/raiva, pausar follow-up e alertar humano

### 6.2. Limite máximo de tentativas

**Hoje:** Steps têm janela fixa, mas não há limite global de "tentativas por conversa"

**Deveria:** Após X steps sem resposta, considerar lead "frio" e parar automação

### 6.3. Tag de bloqueio

**Hoje:** Existe supressão manual, mas não há tag automática tipo "não automatizar"

**Deveria:** Labels/tags específicas bloqueiam follow-up automaticamente

### 6.4. Conversas resolvidas recentemente

**Hoje:** Filtra `status != 'resolved'`, mas não considera conversas resolvidas há poucas horas

**Deveria:** Se conversa foi resolvida há < 24h, não tentar reativar automaticamente

### 6.5. Lead em múltiplas cadências simultaneamente

**Hoje:** Lead pode tecnicamente estar em Lead + Atendimento + Agendado ao mesmo tempo

**Deveria:** Sistema deveria priorizar apenas uma cadência ativa por conversa

---

## 7. Análise Quantitativa (a ser preenchida)

### 7.1. Distribuição de skips (últimas 7 dias)

| Motivo | Quantidade | % |
|---|---|---|
| fora_do_horario | ? | ? |
| em_atendimento_humano | ? | ? |
| sem_step_elegivel | ? | ? |
| whatsapp_desconectado | ? | ? |
| _(outros)_ | ? | ? |

**Ação:** Rodar query em `followup_logs` para preencher

### 7.2. Taxa de skip por cadência

| Cadência | Avaliações | Enviados | Skipped | Taxa de skip |
|---|---|---|---|---|
| Lead | ? | ? | ? | ? |
| Atendimento | ? | ? | ? | ? |
| Agendado | ? | ? | ? | ? |

**Ação:** Analisar execuções de cron dos últimos 7 dias

---

## 8. Skips por Tipo de Filtro

### 8.1. Filtros SQL (pré-loop)

| Cadência | Filtros SQL | Objetivo |
|---|---|---|
| Lead | `status != 'resolved'` | Ignora finalizadas |
| Lead | `last_outgoing_at IS NOT NULL` | Precisa de referência temporal |
| Lead | Limit 500 | Evita timeout |
| Atendimento | `last_outgoing_by = 'human'` | Só pós-humano |
| Agendado | `status = 'scheduled' AND start_at > NOW()` | Só appointments futuros |
| Agendado | `start_at < NOW() + INTERVAL '3 days'` | Janela de 3 dias |

### 8.2. Filtros de código (pós-query)

| Filtro | Implementação | Visibilidade |
|---|---|---|
| Supressão manual | `getSuppressedConversations()` → `Set.has()` | ❌ Silencioso |
| Lead respondeu | `last_incoming_at >= last_outgoing_at` | ❌ Silencioso |
| Agendamento futuro | `queryConversationsWithScheduledAppointment()` | ❌ Silencioso |

### 8.3. Checks individuais (loop)

| Check | Log? | UI? |
|---|---|---|
| Stage in_service/awaiting_human | ✅ | ❌ |
| Sem contact_id | ✅ | ❌ |
| Sem step elegível | ✅ | ❌ |
| Contact não encontrado | ✅ | ❌ |
| Sem telefone | ❌ | ❌ |
| Step já enviado | ❌ | ❌ |
| WhatsApp offline | ✅ | ❌ |

---

## 9. Recomendações para Fase 1

### 9.1. Criar evento para cada skip

**Motivo:** Rastreabilidade total

**Implementação:** Toda decisão de skip gera `followup_events` com:
- `event_type = 'followup_skipped'` ou `'followup_blocked'`
- `reason_code` (string técnica)
- `reason_label` (string humanizada)
- `display_text` (para UI)

### 9.2. Diferenciar skip vs. block

| Termo | Significado | Severidade |
|---|---|---|
| **Skip** | Condição temporária (ex: fora do horário) | 🟡 Baixa |
| **Block** | Condição persistente (ex: humano ativo, suprimido) | 🟠 Média |
| **Fail** | Erro técnico (ex: WhatsApp offline) | 🔴 Alta |

### 9.3. Priorizar motivos

Se múltiplos motivos, exibir o mais grave:

1. 🔴 Falhas técnicas (WhatsApp, circuit breaker)
2. 🟠 Bloqueios de regra (humano ativo, suprimido)
3. 🟡 Skips temporários (horário, janela)

### 9.4. Exibir no Desk

Card de follow-up mostra:
- ✅ "Próximo envio: amanhã 09:00"
- ⚠️ "Follow-up pausado: humano ativo"
- ❌ "Follow-up bloqueado: WhatsApp desconectado"

---

## 10. Conclusão

### O que funciona:

- Regras técnicas (horário, idempotência) funcionam
- Circuit breaker protege de falhas em massa
- Supressão manual permite controle

### O que não funciona:

- **Invisibilidade total de decisões**
- **Skips silenciosos** escondem problemas
- **Humano ativo vira buraco negro**
- **Sem análise de contexto da mensagem**
- **Sem priorização de motivos**

### Próximo passo:

Criar análise quantitativa de dados (queries em `followup_logs` e `followup_cadence_steps`)

---

**Autor:** CTO ChatSales  
**Revisado por:** —  
**Próxima revisão:** Fase 1
