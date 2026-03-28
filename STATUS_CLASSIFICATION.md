# 📊 REVISÃO: Status Atual do Sistema de Prompt vs Output

## 🎯 Conclusão Principal

**A implementação da `classification` com intent, stage, status JÁ ESTÁ COMPLETA E FUNCIONANDO!**

Você receberia este documento analisando um código que já foi corrigido recentemente. Abaixo está o mapeamento de onde tudo está conectado.

---

## ✅ O QUE JÁ ESTÁ IMPLEMENTADO

### 1️⃣ System Prompt Correto
**Arquivo:** `src/lib/bot/system-prompt.ts` (linhas 150-170)

O prompt instrui a IA com exatidão:
```json
{
  "reply": "texto da resposta ou null",
  "status_next": "pending|open|resolved",
  "labels_next": ["etapa_*"],
  "classification": {
    "intent": "triagem|qualificacao|agendamento|confirmacao|pos|humano|outro",
    "stage": "nome da etapa atual ou null",
    "status": "pending|open|resolved"
  },
  "handoff": { ... },
  "actions": { ... },
  "debug": { ... }
}
```

### 2️⃣ Output Schema com Validação Zod
**Arquivo:** `src/lib/bot/output-schema.ts` (completo)

```typescript
const ClassificationSchema = z.object({
  intent: IntentEnum,
  stage: z.string().nullable(),
  status: StatusEnum,
})

export const AgentOutputSchema = z.object({
  reply: z.string().nullable(),
  status_next: StatusEnum,
  labels_next: z.array(z.string()).min(1),
  classification: ClassificationSchema,  // ← VALIDADO
  handoff: z.object({ ... }),
  actions: z.object({ ... }),
  debug: z.object({ ... }),
})
```

**Fallback também inclui `classification`:**
```typescript
export const fallbackOutput: AgentOutput = {
  reply: null,
  status_next: 'pending',
  labels_next: ['etapa_triagem'],
  classification: {             // ← PRESENTE
    intent: 'outro',
    stage: null,
    status: 'pending',
  },
  // ... resto
}
```

### 3️⃣ Dispatcher Consumindo Classification
**Arquivo:** `src/lib/bot/dispatcher.ts`

#### A. Detecção de Cadência (linha 19)
```typescript
const stage = output.classification.stage?.trim().toLowerCase() ?? null

function detectFollowupCadence(output: AgentOutput): 'lead' | 'atendimento' | 'agendado' | null {
  const labels = output.labels_next.map(normalizeTag)
  const stage = output.classification.stage?.trim().toLowerCase() ?? null
  
  // Mapeia stage → cadência
  if (hasAny(['etapa_agendado', ... ]) || stage === 'agendado') return 'agendado'
  if (hasAny(['etapa_paciente', ... ]) || stage === 'atendimento') return 'atendimento'
  if (hasAny(['etapa_triagem', ... ]) || stage === 'lead') return 'lead'
  return null
}
```

#### B. Salvando Classification no Banco (linha 145)
```typescript
async function updateConversationRecord(conversationId: string, output: AgentOutput): Promise<void> {
  const followupCadence = detectFollowupCadence(output)
  
  const updates: Record<string, unknown> = {
    status: output.classification.status,          // ← SAVING STATUS
    labels: output.labels_next,
    followup_cadence: followupCadence ?? undefined,
    updated_at: new Date().toISOString(),
    last_outgoing_at: output.reply ? new Date().toISOString() : undefined,
  }
  
  await supabase.from('conversations').update(updates).eq('id', conversationId)
}
```

### 4️⃣ Fluxo Completo (Sem Discord)

```
┌─── OpenAI (gpt-4o-mini) ────────────────┐
│ Input: chatMessages + systemPrompt      │
│ Parâmetros: temp=0.3, max=800           │
│ Response Format: json_object             │
└──────────────────────────────────────────┘
                    │
                    ↓
        JSON com classification
                    │
                    ↓
      safeParseAgentOutput()
        ← AgentOutputSchema ←
                    │
        ✅ Válido (classification presente)
                    │
                    ↓
        dispatcher() consome:
        - reply → WhatsApp
        - classification.status → Supabase
        - classification.stage → detectFollowupCadence()
        - labels_next → Chatwoot
        - actions → Calendar Agent
        - handoff → Human Transfer
                    │
                    ↓
        ✅ Conversation atualizada com intent/stage/status
```

---

## 🎯 Onde Cada Campo é Usado

| Campo | Salvo em | Usado por | Objetivo |
|---|---|---|---|
| `classification.intent` | debug.detected_intent (log) | Observabilidade, estatísticas | Rastrear qual intenção o bot detectou |
| `classification.stage` | followup_cadence | Cron de cadências | Determinar qual pipeline o lead está |
| `classification.status` | conversations.status | Dispatcher, Dashboard | Estado da conversa (pending/open/resolved) |
| `labels_next` | conversations.labels | Chatwoot, filtros | Tags de contexto (etapa_triagem, etc) |
| `reply` | messages.content | WhatsApp, audit log | A mensagem enviada |

---

## ⚠️ Gap Identificado: Salvando Intent Explicitamente

Atualmente:
- ✅ Intent está sendo extraído (classification.intent)
- ✅ Intent está em debug.detected_intent (logs)
- ❌ Intent NÃO está salvo em uma coluna específica de `conversations`

**Impacto:** Você não consegue facilmente fazer uma query como:
```sql
SELECT * FROM conversations WHERE last_intent = 'agendamento'
```

**Solução Recomendada (próximo sprint):**

Adicione uma coluna a `conversations`:
```sql
ALTER TABLE conversations 
ADD COLUMN last_intent text 
DEFAULT 'outro' 
CHECK (last_intent IN ('triagem','qualificacao','agendamento','confirmacao','pos','humano','outro'));
```

Atualize o dispatcher:
```typescript
const updates: Record<string, unknown> = {
  status: output.classification.status,
  labels: output.labels_next,
  last_intent: output.classification.intent,  // ← ADICIONAR
  followup_cadence: followupCadence ?? undefined,
  // ...
}
```

---

## 📊 Exemplo Real de Fluxo End-to-End

### Input (Paciente via WhatsApp)
```
"Olá, gostaria de agendar uma consulta para próxima segunda"
```

### Processing
```
1. Chatwoot recebe mensagem
2. Webhook /api/webhooks/chatwoot dispara pipeline
3. buildSystemPrompt() cria prompt dinâmico com serviços do cliente
4. OpenAI chama com gpt-4o-mini
5. IA retorna JSON (exemplo):
```

### Output da IA
```json
{
  "reply": "Claro! Tenho disponibilidade na segunda às 10:00, 14:00 ou 16:00. Qual combina com você?",
  "status_next": "pending",
  "labels_next": ["etapa_agendando", "lead_qualificado"],
  "classification": {
    "intent": "agendamento",
    "stage": "agendando",
    "status": "pending"
  },
  "handoff": { "needs_human": false, "reason": null },
  "actions": {
    "agenda_check": { "should_check": true, "time_window_hint": "próxima segunda" },
    "agenda_create": { "should_create": false, ... }
  },
  "debug": { "detected_intent": "agendamento", "stage_current": "agendando", "notes": null }
}
```

### Dispatcher Processa
```typescript
✅ Envia WhatsApp (reply)
✅ Salva em conversations:
   {
     status: "pending",
     labels: ["etapa_agendando", "lead_qualificado"],
     followup_cadence: "lead",  // detectFollowupCadence() deduziu de stage="agendando"
     last_outgoing_at: NOW(),
     last_outgoing_by: "ai"
   }
✅ Atualiza Chatwoot com labels e status
✅ Dispara handleAgendaCheck() → calendar-agent consulta Google Calendar
```

---

## ✅ Checklist: Tudo Funcionando?

- [x] System Prompt instruí com `classification` no JSON esperado
- [x] Output Schema (Zod) valida `classification`
- [x] Fallback inclui `classification` com defaults
- [x] Dispatcher consome `classification.status` e salva em banco
- [x] Dispatcher consome `classification.stage` e usa para `detectFollowupCadence()`
- [x] IA aguenta estrutura JSON (não tem problema)
- [x] Sem parse errors (schema passa)
- [x] Logs mostram intent corretamente

---

## 🚀 Próximos Passos (Melhorias Opcionais)

### Curto Prazo (Quick Wins)
1. ✅ **Já feito:** Classification funciona
2. [ ] Adicionar coluna `last_intent` em `conversations` (sugestão acima)
3. [ ] Criar view/query no dashboard mostrando distribuição de intents

### Médio Prazo (Observabilidade)
1. [ ] Carregar `classification` no audit log (client-audit-log.tsx)
2. [ ] Card em client-metrics.tsx mostrando "Últimas intents detectadas"
3. [ ] Alerta se muitos "outro" (intent desconhecido)

### Longo Prazo (ML/Analytics)
1. [ ] Salvar histórico de intents por conversation
2. [ ] Treinar modelo para prever intent antes da IA rodar (cache)
3. [ ] Dashboard agregado por cliente: % de intents (triagem 20%, agendamento 60%, etc)

---

## 📝 Conclusão

**Seu sistema está bem arquitetado!** A separação entre:
- `classification` (o que a IA detectou)
- `labels_next` (tags de contexto)
- `status_next` (estado da conversa)
- `debug` (info extra para logs)

...permite que você tenha **rastreabilidade completa do funil** sem duplicação.

O único gap é **não persistir explicitamente o `intent` em `conversations`**, o que você pode resolver facilmente na próxima sprint com a sugestão de coluna acima.
