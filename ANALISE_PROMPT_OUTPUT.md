# 📊 ANÁLISE: Prompt vs Output do Bot Engine

## 🎯 O que você pediu

1. **Como está o Prompt inputado no Agente de IA?**
2. **Como ele está "cuspindo" o output?**
3. **Adicionar classificação de ETAPAS com intent, etapa/stage, status**

---

## 1️⃣ COMO ESTÁ O PROMPT

### Arquivo: `src/lib/bot/system-prompt.ts`

Monta **dinamicamente** a partir de `panel_bot_config`:

```
1. Identificação:
   - Profissional (nome, título)
   - Negócio (nome da empresa)
   - Paciente atual (primeiro nome apenas)
   - Data/hora em horário de Brasília

2. Instruções Base:
   - TOM: formal | professional_friendly | casual | empathetic
   - IDIOMA: português (padrão) ou configurable (en, es, fr)
   - RESTRIÇÃO: máximo 1-4 linhas, sem markdown, seja direto e humano

3. Contexto Prático:
   - SERVIÇOS: lista dos serviços disponíveis (nome, duração, modalidade, preço)
   - HORÁRIOS: dias e horas de funcionamento
   - REGRAS: duração padrão, dias de antecedência, agendamento same-day

4. Comportamento Esperado:
   - AGENDAMENTO: como detectar intent e disparar actions.agenda_check
   - TRANSFERÊNCIA: quando fazer handoff (negatividade, urgência, palavras-chave)
   - LABELS: quais etapas usar (triagem, qualificacao, agendamento, etc.)
   - STATUS: pending → open → resolved

5. OBRIGATÓRIO - Formato de Saída (NO FINAL):
   Retorne APENAS este JSON, sem markdown:
   {
     "reply": "texto da resposta ou null",
     "status_next": "pending|open|resolved",
     "labels_next": ["etapa_*"],
     "classification": {
       "intent": "triagem|qualificacao|agendamento|confirmacao|pos|humano|outro",
       "stage": "nome da etapa atual ou null",
       "status": "pending|open|resolved"
     },
     "handoff": { "needs_human": false, "reason": null },
     "actions": { ... },
     "debug": { ... }
   }
```

### Variáveis Dinâmicas Injetadas
| Config | Onde Vem | Exemplo |
|---|---|---|
| professional_name | panel_bot_config.professional_name | "Dr. João" |
| business_name | panel_bot_config.business_name | "Clínica XYZ" |
| ai_tone | panel_bot_config.ai_tone | "professional_friendly" |
| working_hours | panel_bot_config.working_hours | "Segunda: 08:00–18:00" |
| services | panel_bot_config.services[] | "Consulta: 60min, presencial, R$200" |
| ai_language | panel_bot_config.ai_language | "pt-BR" |
| ai_custom_instructions | panel_bot_config.ai_custom_instructions | Campo livre |

---

## 2️⃣ COMO ESTÁ O OUTPUT

### Arquivo: `src/lib/bot/output-schema.ts`

```typescript
// O que a IA deve retornar (validado com Zod):

AgentOutputSchema = {
  reply: string | null,
  status_next: "pending" | "open" | "resolved",
  labels_next: ["etapa_*", ...],
  
  handoff: {
    needs_human: boolean,
    reason: string | null
  },
  
  actions: {
    agenda_check: { 
      should_check: boolean, 
      time_window_hint: string | null 
    },
    agenda_create: {
      should_create: boolean,
      start_iso: string | null,
      end_iso: string | null,
      title: string | null
    },
    agenda_update: {
      should_update: boolean,
      google_event_id: string | null
    }
  },
  
  debug: {
    detected_intent: "triagem"|"qualificacao"|"agendamento"|"confirmacao"|"pos"|"humano"|"outro",
    stage_current: string | null,
    notes: string | null
  }
}
```

### Fluxo do Output
```
1. OpenAI retorna JSON com response_format: { type: "json_object" }
   Parâmetros: model=gpt-4o-mini, temperature=0.3, max_tokens=800
   
2. safeParseAgentOutput() tenta:
   - Extrair JSON de string bruta
   - Validar com AgentOutputSchema (Zod)
   - Se falhar → retorna fallbackOutput (defaults seguros)
   
3. Dispatcher consome:
   - reply → envia WhatsApp (Evolution API)
   - labels_next → atualiza Chatwoot
   - status_next → atualiza Chatwoot
   - handoff.needs_human → transferência
   - actions.agenda_* → dispara calendar-agent
   - debug → logging
```

---

## 🚨 PROBLEMA IDENTIFICADO

### ❌ Discord entre Prompt e Schema

**O PROMPT INSTRUIU:**
```json
"classification": {
  "intent": "...",
  "stage": "...",
  "status": "..."
}
```

**MAS O SCHEMA VALIDA:**
```json
"debug": {
  "detected_intent": "...",
  "stage_current": "...",
  "notes": "..."
}
```

### Consequência
- IA tenta retornar `classification` conforme instrução
- Zod rejeita porque não reconhece o campo
- `safeParseAgentOutput()` retorna `fallbackOutput` (defaults)
- A IA "cuspiu" tudo certo, mas foi descartado ❌

---

## 3️⃣ O QUE VOCÊ QUER ADICIONAR

### Classificação de ETAPAS
Você quer que o output tenha **campos estruturados** para capturar:
- **intent**: qual intenção do usuário (triagem, qualificacao, agendamento, etc.)
- **etapa/stage**: em qual estágio do funil está (lead, em_atendimento, agendado, etc.)
- **status**: qual será o próximo status (pending, open, resolved, etc.)

---

## ✅ SOLUÇÃO PROPOSTA

### Opção 1: Corrigir o Discord (Uso Imediato)

Atualize `output-schema.ts` para aceitar o campo `classification` conforme o prompt instruiu:

```typescript
export const AgentOutputSchema = z.object({
  reply: z.string().nullable(),
  status_next: z.enum(['pending', 'open', 'resolved']),
  labels_next: z.array(z.string()).min(1),
  
  classification: z.object({  // ← ADICIONAR ESTE BLOCO
    intent: z.enum([
      'triagem',
      'qualificacao',
      'agendamento',
      'confirmacao',
      'pos',
      'humano',
      'outro',
    ]),
    stage: z.string().nullable(),
    status: z.enum(['pending', 'open', 'resolved']),
  }).optional(),  // Tornar opcional se quiser backward-compat
  
  handoff: z.object({ ... }),
  actions: z.object({ ... }),
  debug: z.object({ ... }),
})
```

### Opção 2: Refactor Completo (Mais Limpo)

Remover duplicação entre `classification`, `debug` e `labels_next`:

```typescript
// Novo schema
export const AgentOutputSchema = z.object({
  reply: z.string().nullable(),
  
  // Classificação centralizada (o que você pediu)
  classification: z.object({
    intent: z.enum([...]),
    stage: z.string().nullable(),
    status: z.enum(['pending', 'open', 'resolved']),
  }),
  
  labels_next: z.array(z.string()).min(1),
  handoff: z.object({ needs_human: z.boolean(), reason: z.string().nullable() }),
  actions: z.object({ ... }),
  debug: z.object({ notes: z.string().nullable() }),  // Apenas notas
})
```

---

## 📋 PRÓXIMOS PASSOS

### Imediato (Quick Fix)
1. Editar `src/lib/bot/output-schema.ts` → adicionar `classification` block
2. Testar se IA aguenta a estrutura ligeiramente mais complexa
3. Verificar se `safeParseAgentOutput()` passa a aceitar o JSON

### Médio Prazo (Refactor)
1. Consolidar `classification` como field principal
2. Atualizar `dispatcher.ts` para usar `classification.intent`, `classification.stage`
3. Atualizar `system-prompt.ts` para documentar os valores esperados
4. Adicionar observabilidade (logs, dashboard) mostrando intent/stage/status

### Longo Prazo (Observabilidade)
1. Salvar `classification` em tabela `followup_logs` ou similar
2. Criar dashboard mostrando distribuição de intents por cliente
3. Alertas se muitos leads em "outro" (intent desconhecido)

---

## 🔍 Exemplo Real de Output Esperado

```json
{
  "reply": "Claro! Que horário você prefere?",
  "status_next": "pending",
  "labels_next": ["etapa_agendando"],
  
  "classification": {
    "intent": "agendamento",
    "stage": "agendando",
    "status": "pending"
  },
  
  "handoff": { "needs_human": false, "reason": null },
  
  "actions": {
    "agenda_check": { 
      "should_check": true, 
      "time_window_hint": "próximo sábado à tarde" 
    },
    "agenda_create": { "should_create": false, ... },
    "agenda_update": { "should_update": false, ... }
  },
  
  "debug": {
    "detected_intent": "agendamento",
    "stage_current": "agendando",
    "notes": "Paciente pediu fim de semana"
  }
}
```

---

## 📞 Quer que eu implementar a Opção 1 ou Opção 2?

Recomendo **Opção 1 (Quick Fix)** primeiro, testar em produção por uma semana, depois fazer **Opção 2 (Refactor Completo)** com segurança.
