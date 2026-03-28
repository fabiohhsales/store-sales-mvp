# 💻 IMPLEMENTAÇÃO PRONTA: Adicionar last_intent

Se você decidir implementar a melhoria de persistir `classification.intent`, aqui estão os files prontos para copiar/colar.

---

## 1️⃣ Migration SQL

**Arquivo:** `supabase/migrations/005_add_intent_to_conversations.sql`

```sql
-- Migration 005: Adicionar rastreamento de last_intent
-- Objetvo: Persistir a última intenção detectada pela IA para observabilidade

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_intent text 
DEFAULT 'outro' 
CHECK (last_intent IN (
  'triagem',
  'qualificacao', 
  'agendamento', 
  'confirmacao', 
  'pos', 
  'humano', 
  'outro'
));

-- Index para queries rápidas: "todos agendamentos dos últimos 30 dias"
CREATE INDEX IF NOT EXISTS idx_conversations_last_intent 
ON conversations(last_intent, created_at DESC);

-- Index composto: análises por cliente + intent
CREATE INDEX IF NOT EXISTS idx_conversations_client_intent 
ON conversations(client_id, last_intent, created_at DESC);

-- Comentário para documentação
COMMENT ON COLUMN conversations.last_intent IS 
  'Última intenção detectada pela IA: triagem, qualificacao, agendamento, confirmacao, pos, humano, outro';
```

---

## 2️⃣ Atualizar Dispatcher

**Arquivo:** `src/lib/bot/dispatcher.ts`

### Localizar (linha ~135-150)
```typescript
// Atualiza status, labels e timestamps na tabela conversations
async function updateConversationRecord(
  conversationId: string,
  output: AgentOutput
): Promise<void> {
  const supabase = createAdminClient()
  const followupCadence = output.labels_next.length > 0 ? detectFollowupCadence(output) : null

  const updates: Record<string, unknown> = {
    status: output.classification.status,
    labels: output.labels_next,
    followup_cadence: followupCadence ?? undefined,
    updated_at: new Date().toISOString(),
    last_outgoing_at: output.reply ? new Date().toISOString() : undefined,
    last_outgoing_by: output.reply ? 'ai' : undefined,
  }

  // Remove undefined fields
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete updates[key]
  }

  await supabase.from('conversations').update(updates).eq('id', conversationId)
}
```

### Substituir por:
```typescript
// Atualiza status, labels e timestamps na tabela conversations
async function updateConversationRecord(
  conversationId: string,
  output: AgentOutput
): Promise<void> {
  const supabase = createAdminClient()
  const followupCadence = output.labels_next.length > 0 ? detectFollowupCadence(output) : null

  const updates: Record<string, unknown> = {
    status: output.classification.status,
    labels: output.labels_next,
    last_intent: output.classification.intent,  // ← ADICIONAR ESTA LINHA
    followup_cadence: followupCadence ?? undefined,
    updated_at: new Date().toISOString(),
    last_outgoing_at: output.reply ? new Date().toISOString() : undefined,
    last_outgoing_by: output.reply ? 'ai' : undefined,
  }

  // Remove undefined fields
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete updates[key]
  }

  await supabase.from('conversations').update(updates).eq('id', conversationId)
}
```

---

## 3️⃣ Atualizar Types (Opcional)

**Arquivo:** `src/types/bot.ts`

### Localizar BotConversation
```typescript
export interface BotConversation {
  id: string
  client_id: string
  contact_id: string
  chatwoot_id?: number | null
  // ... outros campos ...
}
```

### Adicionar field (after contact_id):
```typescript
export interface BotConversation {
  id: string
  client_id: string
  contact_id: string
  chatwoot_id?: number | null
  last_intent?: string | null  // ← ADICIONAR
  // ... resto dos campos ...
}
```

---

## 4️⃣ Testar Localmente

### Passo 1: Deploy da Migration
```bash
# Executar no Supabase
# Ir para: https://supabase.com/dashboard → SQL Editor
# Criar nova query, copiar o SQL da migration
# Executar

# Ou se tiver CLI:
supabase db push
```

### Passo 2: Enviar Test Message
```
WhatsApp test → Chatwoot → Bot responde
```

### Passo 3: Verificar BD
```sql
-- No Supabase SQL Editor:
SELECT id, labels, status, last_intent, created_at
FROM conversations
WHERE client_id = 'YOUR_CLIENT_ID'
ORDER BY created_at DESC
LIMIT 5;
```

**Esperado:** Coluna `last_intent` preenchida com valor ('triagem', 'agendamento', etc)

---

## 5️⃣ Commit Git

```bash
git add \
  supabase/migrations/005_add_intent_to_conversations.sql \
  src/lib/bot/dispatcher.ts \
  src/types/bot.ts

git commit -m "feat: persist classification.intent to conversations table"

git push origin main
# Ou seu branch
```

---

## 6️⃣ Validação Pós-Deploy

### Query 1: Verificar Intents
```sql
SELECT 
  last_intent,
  COUNT(*) as count,
  ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM conversations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY last_intent
ORDER BY count DESC;
```

**Esperado:** Ver distribuição de intents, sem muitos `outro` (se tiver >30%, algo errado)

### Query 2: Alertar se muito "outro"
```sql
SELECT 
  client_id,
  COUNT(*) as total_conv,
  COUNT(*) FILTER (WHERE last_intent = 'outro') as outro_count,
  ROUND(100 * COUNT(*) FILTER (WHERE last_intent = 'outro') / COUNT(*), 2) as pct_outro
FROM conversations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY client_id
HAVING COUNT(*) FILTER (WHERE last_intent = 'outro') > 20
ORDER BY pct_outro DESC;
```

---

## 7️⃣ Próxima Feature: Dashboard

Se quiser adicionar observabilidade no painel, crie:

**Arquivo:** `src/app/api/analytics/intents/route.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'Missing client_id' }, { status: 400 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('last_intent, COUNT(*) as count', { count: 'exact' })
    .eq('client_id', clientId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .group_by('last_intent')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Transforma em objeto { intent: count }
  const result = (data || []).reduce(
    (acc: Record<string, number>, row: any) => ({
      ...acc,
      [row.last_intent]: row.count,
    }),
    {}
  )

  return NextResponse.json(result)
}
```

---

## 📋 Checklist de Implementação

- [ ] Criar arquivo migration `005_add_intent_to_conversations.sql`
- [ ] Executar migration no Supabase
- [ ] Editar `src/lib/bot/dispatcher.ts` (1 linha)
- [ ] Editar `src/types/bot.ts` (1 linha)
- [ ] Testar com conversation local
- [ ] Verificar BD com SELECT
- [ ] Commit e push
- [ ] Deploy em produção
- [ ] Monitorar por 24h (sem regressions)
- [ ] (Opcional) Criar dashboard card

---

## ⚠️ Rollback (Se Necessário)

```sql
-- Desfazer tudo:
ALTER TABLE conversations DROP COLUMN IF EXISTS last_intent;
DROP INDEX IF EXISTS idx_conversations_last_intent;
DROP INDEX IF EXISTS idx_conversations_client_intent;
```

Mas isso shouldn't happen — é uma nullable column com default.

---

## 🎯 Success Indicators

✅ Cada nova conversa tem `last_intent` preenchido  
✅ Dashboard mostra distribuição correta  
✅ Queries de análise rodam rápido (graças aos indices)  
✅ Sem impacto de performance (coluna indexed)  

---

## 📞 Suporte

**Dúvida na migration?** Testar primeiro em dev branch.  
**Erro ao fazer push?** Verificar se migration number (005) não conflict.  
**Query lenta?** Verificar indices foram criados corrretamente.
