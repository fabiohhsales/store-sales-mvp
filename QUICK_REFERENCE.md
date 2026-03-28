# 🎯 QUICK REFERENCE: Bot Engine em Uma Página

## 📍 Localizações Principais

| O Quê | Arquivo | Linhas | O Que Faz |
|---|---|---|---|
| **System Prompt** | `src/lib/bot/system-prompt.ts` | 1-170 | Constrói prompt dinâmico com config do cliente |
| **Output Schema** | `src/lib/bot/output-schema.ts` | 1-80 | Define e valida JSON que IA retorna (Zod) |
| **AI Agent** | `src/lib/bot/agent.ts` | 1-160 | Chama OpenAI e recebe AgentOutput |
| **Dispatcher** | `src/lib/bot/dispatcher.ts` | 1-170 | Consome output e distribui para WhatsApp/Chatwoot/DB |
| **Pipeline Output** | `src/lib/bot/pipeline.ts` | 1-200+ | Resgata histórico de mensagens e contexto |

---

## 🧠 Classification: Os 3 Campos

```
classification: {
  intent:  "triagem"      ← O que o paciente QUER
  stage:   "triagem"      ← EM QUE ETAPA ESTÁ
  status:  "pending"      ← QUAL SERÁ O PRÓXIMO ESTADO
}
```

### Intent Enum
```typescript
'triagem'        // Descobrir necessidade
'qualificacao'   // Coletar informações
'agendamento'    // Negociar horário
'confirmacao'    // Confirmar consulta
'pos'            // Pós-consulta / acompanhamento
'humano'         // Transferência para humano
'outro'          // Não conseguiu detectar
```

### Stage (Livre)
```
'triagem'        → cadência: 'lead'
'qualificacao'   → cadência: 'atendimento'
'agendando'      → cadência: 'lead' (ainda não agendou)
'agendado'       → cadência: 'agendado' (já agendou)
'confirmado'     → cadência: 'agendado'
'atendimento'    → cadência: 'atendimento'
'paciente'       → cadência: 'atendimento'
'inativo'        → cadência: 'lead'
```

### Status
```
'pending'   → IA respondeu, aguardando próximo mensaje
'open'      → Transferência para humano, agente precisa responder
'resolved'  → Conversa encerrada
```

---

## 🔀 Fluxo Mínimo da Mensagem

```
WhatsApp
   ↓
Chatwoot (webhook)
   ↓
/api/webhooks/chatwoot (POST)
   ↓
1. pipeline() ← Prepara contexto, histórico
   ↓
2. runAgent() ← Chama OpenAI com systemPrompt
   ↓
3. safeParseAgentOutput() ← Valida Zod
   ↓
4. dispatch() ← Executa ações
   ├─ sendTextMessage() → WhatsApp
   ├─ updateConversationLabels() → Chatwoot
   ├─ conversations.update() → Supabase
   ├─ handleAgendaCheck() → Google Calendar
   └─ clearAiPause() → Libera trava
   ↓
✅ Resposta enviada, BD atualizado
```

---

## 🔍 Debug: Como Ver o Que Está Acontecendo

### Logs do Agent
```typescript
// src/lib/bot/agent.ts, linha ~130
console.log(
  `[Agent] conv=${conversation.id} intent=${output.debug.detected_intent}` +
  ` status=${output.status_next} handoff=${output.handoff.needs_human}`
)
```

### Logs do Dispatcher  
```typescript
// src/lib/bot/dispatcher.ts (implícito nas atualizações)
// Ver no Supabase: botões de conversation em admin painel
```

### Consultar Direct BD
```sql
-- Última conversa de um contato
SELECT id, labels, status, created_at
FROM conversations
WHERE client_id = 'abc123'
ORDER BY created_at DESC
LIMIT 5;

-- Ver última mensagem da IA
SELECT from_who, content, created_at
FROM messages
WHERE conversation_id = 'xyz'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🛠️ Config do Cliente Que Afeta o Prompt

```typescript
panel_bot_config {
  professional_name: "Dr. João"
  professional_title: "Cardiologista"
  business_name: "Clínica XYZ"
  ai_tone: "professional_friendly"  // formal | professional_friendly | casual | empathetic
  ai_language: "pt-BR"              // pt-BR | en | es | fr
  ai_custom_instructions: "..."     // Campo livre
  services: [                        // Lista de serviços
    { name: "Consulta", duration_minutes: 60, modality: "presencial", price: 200 }
  ]
  working_hours: {                   // Horários por dia
    monday: { enabled: true, start: "08:00", end: "18:00", break_start: "12:00", break_end: "13:00" }
    // ...
  }
  handoff_keywords: ["emergência", "urgência"]  // Palavras que trigam handoff
  handoff_on_negative_sentiment: true           // Raiva/frustração → handoff
  handoff_on_medical_urgency: true              // Sintomas urgentes → handoff
  handoff_max_ai_turns: 20                      // Max turnos antes de forçar handoff
}
```

---

## ⚙️ Parâmetros da Chamada OpenAI

```typescript
// src/lib/bot/agent.ts, linha ~110
const completion = await openai.chat.completions.create({
  model: AI_MODEL,                    // "gpt-4o-mini" (definido em src/lib/ai/client.ts)
  messages: chatMessages,             // [system_prompt, ...history]
  response_format: { type: 'json_object' },  // Força retorno JSON
  temperature: 0.3,                   // Baixo = mais determinístico
  max_tokens: 800,                    // Máximo 800 tokens de output
})
```

**Por que esses valores?**
- `temperature: 0.3` → Menos criativo, mais consistente
- `max_tokens: 800` → Evita respostas gigantes, economiza custo
- `response_format: json_object` → Garante JSON válido

---

## 🚀 Performance

| Métrica | Esperado | Onde Medir |
|---|---|---|
| Latência IA | 1-3s | Logs do agent.ts |
| Parse/Validação | < 100ms | safeParseAgentOutput() |
| Dispatch Total | 500ms-1s | Desde webhook até resposta |
| AI Pause Duration | 10 min | tabela ai_pauses (evita loop) |

---

## 🔴 Troubleshooting

### Status "parse_error" em fallbackOutput
```
❌ Problema: IA retornou JSON inválido
✅ Verificar:
   1. Logs do OpenAI (content truncado? token limit?)
   2. System prompt está bem formatado?
   3. Chat history tem mensagens muito longas?
   4. Tente reduzir max_tokens
```

### Mensagem não enviada
```
❌ Problem: reply é null mas não é handoff
✅ Verificar:
   1. output.reply é realmente null?
   2. identifier (phone) está correto?
   3. Evolution API credentials?
   4. Chatwoot agente token ativo?
```

### Muitos "outro" (intent desconhecido)
```
❌ Problema: IA confusa
✅ Verificar:
   1. ai_custom_instructions está claro?
   2. services foram configurados?
   3. Prompt tem exemplos suficientes?
   4. Tentar aumentar temperature para 0.5 ou adicionar mais contexto ao prompt
```

### Handoff não disparando
```
❌ Problema: Conversa não transfere
✅ Verificar:
   1. handoff_on_* flags estão ativados?
   2. handoff_keywords coincide com input?
   3. output.handoff.needs_human === true?
   4. Chatwoot agent ativo para receber?
```

---

## 📊 Observabilidade: Queries Úteis

### Health Check (últimas 100 conversas)
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'open') as open,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
  AVG(EXTRACT(EPOCH FROM updated_at - created_at)) as avg_duration_seconds
FROM conversations
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND client_id = 'YOUR_CLIENT_ID';
```

### Intent Distribution
```sql
SELECT 
  labels ->> 0 as stage,
  COUNT(*) as count,
  ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM conversations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY labels ->> 0
ORDER BY count DESC;
```

### Conversations Stuck (sem atualização > 6h)
```sql
SELECT 
  id, client_id, contact_id, labels,
  updated_at, NOW() - updated_at as idle_duration
FROM conversations
WHERE updated_at < NOW() - INTERVAL '6 hours'
  AND status = 'pending'
ORDER BY updated_at;
```

---

## 🎓 Exemplos Real

### Exemplo 1: Triagem → Agendamento
```
User: "Olá, preciso agendar"
AI Classification:
  intent: "triagem"
  stage: "triagem"
  status: "pending"
Reply: "Olá! Sou assistente de Dr. João. Qual é sua necessidade?"
═════════════════════════════════════════════════════════════
User: "Preciso de cardiologia"
AI Classification:
  intent: "qualificacao"
  stage: "qualificacao"
  status: "pending"
Reply: "Perfeito! Temos disponibilidade segunda ou terça. Qual prefere?"
═════════════════════════════════════════════════════════════
User: "Segunda às 10h"
AI Classification:
  intent: "agendamento"
  stage: "agendando"
  status: "pending"
Reply: "Ótimo! Confirmado para segunda às 10h. Você receberá um lembrete 24h antes."
actions.agenda_create.should_create: true
actions.agenda_create.start_iso: "2025-03-31T10:00:00-03:00"
```

### Exemplo 2: Handoff por Urgência
```
User: "Estou com dor aguda no peito!"
AI Classification:
  intent: "humano"
  stage: null
  status: "open"
handoff.needs_human: true
Reply: null (não responde, vai direto para agente)
```

---

## 📋 Checklist: Deploy de Nova Feature

- [ ] Atualizar `system-prompt.ts` com nova instrução
- [ ] (Se mudou schema) Atualizar `output-schema.ts`
- [ ] (Se mudou schema) Atualizar `fallbackOutput`
- [ ] Testar localmente com dev client
- [ ] Ver logs em production (test conversation)
- [ ] Monitorar error rate por 24h
- [ ] Criar metric/alert se necessário
- [ ] Documentar em CLAUDDE.md
- [ ] Commit em português imperatitvo < 72 chars

---

## 🔗 Documentação Relacionada

- `STATUS_CLASSIFICATION.md` — Explicação completa da classification
- `RECOMENDACAO_PERSIST_INTENT.md` — Como adicionar last_intent
- `ANALISE_PROMPT_OUTPUT.md` — Análise técnica profunda
- `.github/agents/dev-chatsales.agent.md` — Guia completo para dev
