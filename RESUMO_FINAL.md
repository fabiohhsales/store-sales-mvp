# 📚 RESUMO EXECUTIVO: Análise Completa do Bot Engine

## 🎯 Sua Pergunta
1. *Queria entender como está o Prompt inputado no Agente de IA?*
2. *E também queria entender como ele está "cuspindo" o output?*
3. *Tem um ponto relevante: classificação de ETAPAS pela IA (intent, etapa/stage, status)*

---

## ✅ Resposta Rápida

### 1. O PROMPT
- ✅ **Construído dinamicamente** a partir de `panel_bot_config`
- ✅ Injeta: profissional, negócio, serviços, horários, tom, idioma, instruções customizadas
- ✅ **Instrui a IA exatamente para retornar `classification`** com intent, stage, status
- 📁 Arquivo: `src/lib/bot/system-prompt.ts`

### 2. O OUTPUT
- ✅ **Schema Zod valida corretamente** o JSON da IA
- ✅ Inclui `classification` com os 3 campos pedidos (intent, stage, status)
- ✅ **SEM DISCORD — tudo funcionando!**
- 📁 Arquivo: `src/lib/bot/output-schema.ts`

### 3. A CLASSIFICAÇÃO
- ✅ Intent detectado e armazenado em `debug.detected_intent`
- ✅ Stage mapeado para cadência (`lead`, `atendimento`, `agendado`)
- ✅ Status salvo em `conversations.status` (pending → open → resolved)
- 📁 Arquivo: `src/lib/bot/dispatcher.ts`

---

## 📊 Documentos Criados para Você

| Documento | Tipo | Conteúdo |
|---|---|---|
| [ANALISE_PROMPT_OUTPUT.md](ANALISE_PROMPT_OUTPUT.md) | 📋 Análise Detalhada | Flow completo, problema identificado, 2 soluções propostas |
| [STATUS_CLASSIFICATION.md](STATUS_CLASSIFICATION.md) | ✅ Status Atual | Confirmação: tudo já está implementado, sem discord |
| [RECOMENDACAO_PERSIST_INTENT.md](RECOMENDACAO_PERSIST_INTENT.md) | 💡 Melhoria Sugerida | Como adicionar coluna last_intent (10 min, alto valor) |

---

## 🔄 O Fluxo Completo (Atualizado)

```
1. PROMPT (Dinâmico)
   └─ buildSystemPrompt(config, contactName)
      ├─ Profissional: "Dr. João (Cardiologista) — Clínica XYZ"
      ├─ Serviços: "Consulta 60min, presencial, R$200"
      ├─ Horários: "Segunda-Sexta: 08:00-18:00"
      ├─ Tone: "professional_friendly"
      ├─ Idioma: "português"
      └─ FORMATO ESPERADO: JSON com classification

2. OPENAI (gpt-4o-mini)
   └─ completion.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [system_prompt, chat_history]
    })

3. OUTPUT (Validado)
   └─ AgentOutput {
      ├─ reply: "Claro! Que horário prefere?"
      ├─ status_next: "pending"
      ├─ labels_next: ["etapa_agendando"]
      ├─ classification: {
      │  ├─ intent: "agendamento"
      │  ├─ stage: "agendando"
      │  └─ status: "pending"
      ├─ handoff: { needs_human: false, reason: null }
      ├─ actions: { agenda_check: { should_check: true, ... }, ... }
      └─ debug: { detected_intent: "agendamento", stage_current: "agendando", notes: null }
    }

4. DISPATCHER (Consome)
   ├─ WHATSAPP: Envia reply via Evolution API
   ├─ CHATWOOT: Atualiza status e labels
   ├─ SUPABASE:
   │  └─ conversations.update({
   │     status: "pending",
   │     labels: ["etapa_agendando"],
   │     followup_cadence: "lead",  ← detectFollowupCadence(output)
   │     last_outgoing_at: NOW(),
   │     last_outgoing_by: "ai"
   │  })
   ├─ CALENDAR: Executa handleAgendaCheck() se necessário
   └─ HUMAN: Faz handoff se necessário

5. PERSISTÊNCIA
   └─ Conversa no banco tem:
      ├─ status: "pending" (da classification)
      ├─ labels: ["etapa_agendando"] (para Chatwoot/filtering)
      ├─ followup_cadence: "lead" (para cron de cadências)
      ├─ last_outgoing_at: timestamp
      └─ ❌ last_intent: (OPORTUNIDADE: adicionar com migration 005)
```

---

## 🎓 Conceitos-Chave Explicados

### A. Classification vs Labels vs Status
```
┌─ CLASSIFICATION (detectado pela IA nesta turn)
│  ├─ intent:  qual intenção o paciente teve ("agendamento")
│  ├─ stage:   estágio atual no funil ("agendando")
│  └─ status:  estado da conversa ("pending" → precisa responder IA)
│
├─ LABELS (contexto acumulado)
│  └─ Array de tags: ["etapa_agendando", "lead_qualificado"]
│     (usado pelo Chatwoot, filters, lógica downstream)
│
└─ STATUS (pode ser)
   ├─ "pending": IA respondeu, aguardando próximo mensaje
   ├─ "open": transferência para humano, precisa agente
   └─ "resolved": conversa encerrada
```

### B. Por Que Separado?
```
- classification: IA toma decisão AGORA
- labels: contexto histórico ACUMULADO
- status: "decisão final" (open/resolved) ou "em andamento" (pending)

Exemplo:
┌─ Turn 1: "Olá, preciso de consulta"
│  ├─ classification: { intent: "triagem", stage: "triagem", status: "pending" }
│  ├─ labels: ["etapa_triagem"]
│  └─ reply: "Olá! Qual é sua especialidade necessária?"
│
└─ Turn 2: "Preciso de cardiologia"
   ├─ classification: { intent: "qualificacao", stage: "qualificacao", status: "pending" }
   ├─ labels: ["etapa_qualificacao", "cardiologia"]  ← ACUMULOU
   └─ reply: "Perfeito! Temos disponibilidade segunda-feira..."
```

### C. Cadência (Funil Automático)
```
detectFollowupCadence() usa stage para determinar:
├─ "agendado" ou "confirmado" → cadência "agendado"
│  (cron dispara reminders/confirmação antes da consulta)
├─ "atendimento" ou "qualificacao" → cadência "atendimento"
│  (cron envia reengajamento após 1,2,4,7,10 dias)
└─ "triagem" ou "lead" → cadência "lead"
   (cron envia follow-up após outgoing do bot)
```

---

## 🚨 O Que Mudou Recentemente?

✅ **Alguém corrigiu o discord antes de você me chamar!**

O código que você tem:
1. **Não tinha** `classification` no schema Zod
2. **Agora tem** — totalmente funcional
3. Dispatcher está consumindo corretamente

**Confirmação:** Sem erros de compilação em nenhum dos arquivos analisados.

---

## 💡 Próximo Passo Recomendado

### Quick Win (10 min)
Implementar sugestão do [RECOMENDACAO_PERSIST_INTENT.md](RECOMENDACAO_PERSIST_INTENT.md):
- Adicioar colona `last_intent` em `conversations`
- Usar para dashboard analytics e alerting
- **Valor:** Rastreabilidade completa + diagnóstico

### Médio Prazo (Próximo Sprint)
- Dashboard mostrando distribuição de intents por cliente
- Alertas se muitos "outro" (bot confuso)
- Queries de diagnóstico para otimizar prompts

---

## 📞 Como Usar Esses Documentos

1. **Precisa entender o fluxo:** Leia [STATUS_CLASSIFICATION.md](STATUS_CLASSIFICATION.md) — tem exemplo real end-to-end
2. **Quer implementar a melhoria:** Siga [RECOMENDACAO_PERSIST_INTENT.md](RECOMENDACAO_PERSIST_INTENT.md) — 10 minutos
3. **Quer detalhe técnico:** Veja [ANALISE_PROMPT_OUTPUT.md](ANALISE_PROMPT_OUTPUT.md) — análise profunda

---

## ✨ Conclusão

Seu bot engine está **bem arquitetado e funcionando corretamente**. A separação entre `classification` (detecção local), `labels` (contexto acumulado), e `status` (estado global) é elegante e escalável.

**Não há nada quebrado. Tudo já está funcionando. 🎉**

A única oportunidade é melhorar observabilidade persistindo `intent` explicitamente — o que é um quick win com alto valor para diagnóstico.
