# 🛠️ RECOMENDAÇÃO: Persistir classif.intent em Conversations

## Problema

Hoje você tem:
```typescript
// dispatcher.ts
const updates: Record<string, unknown> = {
  status: output.classification.status,           // ✅ SALVO
  labels: output.labels_next,                      // ✅ SALVO
  followup_cadence: followupCadence ?? undefined, // ✅ SALVO
  // ❌ classification.intent NÃO TEM COLUNA
}
```

**Consequência:** Não consegue fazer queries como:
```sql
-- Quantos clientes foram em "agendamento" nos últimos 30 dias?
SELECT COUNT(*) 
FROM conversations 
WHERE last_intent = 'agendamento' 
  AND created_at > NOW() - INTERVAL '30 days'
```

---

## Solução (15 min)

### 1. Criar Migration
**Arquivo:** `supabase/migrations/005_add_intent_to_conversations.sql`

```sql
-- Adiciona coluna last_intent para rastrear intent da última IA
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

-- Index para queries rápidas
CREATE INDEX IF NOT EXISTS idx_conversations_last_intent 
ON conversations(last_intent, created_at DESC);

-- Index composto para análise por cliente + intent
CREATE INDEX IF NOT EXISTS idx_conversations_client_intent 
ON conversations(client_id, last_intent, created_at DESC);
```

### 2. Atualizar Dispatcher
**Arquivo:** `src/lib/bot/dispatcher.ts` (linha ~145)

```typescript
// Antes:
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
  // ...
}

// Depois:
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
  // ...
}
```

### 3. Atualizar Type
**Arquivo:** `src/types/bot.ts`

Se houver interface `BotConversation`, adicione:
```typescript
export interface BotConversation {
  // ... existing fields ...
  last_intent?: string | null;  // 'triagem' | 'qualificacao' | 'agendamento' | etc
}
```

---

## Benefícios Imediatos

### Dashboard Analytics
```typescript
// src/app/api/analytics/intents.ts (nova rota)
export async function GET(req: Request) {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('conversations')
    .select('last_intent, COUNT(*) as count')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .group_by('last_intent')
  
  // Retorna: { triagem: 120, agendamento: 450, outro: 30, ... }
}
```

### Queries Úteis para Diagnóstico
```sql
-- Leads presos em "outro" (intent desconhecido)
SELECT conversation_id, client_id, COUNT(*) as ocurrencias
FROM conversations
WHERE last_intent = 'outro'
GROUP BY conversation_id, client_id
ORDER BY ocurrencias DESC
LIMIT 20;

-- Performance por intent (qual leva mais tempo até agendamento?)
SELECT 
  c1.last_intent,
  AVG(EXTRACT(EPOCH FROM (c2.created_at - c1.created_at)) / 3600) as avg_hours_to_booking
FROM conversations c1
LEFT JOIN conversations c2 
  ON c1.contact_id = c2.contact_id 
  AND c2.last_intent = 'agendamento'
  AND c2.created_at > c1.created_at
WHERE c1.client_id = '...'
GROUP BY c1.last_intent;

-- Clientes que recebem muitas "outras" intentoões  (hint: sistema confuso)
SELECT 
  c.client_id, 
  COUNT(*) FILTER (WHERE c.last_intent = 'outro') as outros,
  COUNT(*) as total,
  ROUND(100 * COUNT(*) FILTER (WHERE c.last_intent = 'outro') / COUNT(*), 2) as pct_outros
FROM conversations c
WHERE c.created_at > NOW() - INTERVAL '7 days'
GROUP BY c.client_id
HAVING COUNT(*) FILTER (WHERE c.last_intent = 'outro') > 10
ORDER BY pct_outros DESC;
```

### Observabilidade Client-side
```typescript
// src/components/client-detail/client-metrics.tsx (adicionar card)
export function IntentDistribution({ clientId }: { clientId: string }) {
  const [intents, setIntents] = useState<Record<string, number>>({})
  
  useEffect(() => {
    fetch(`/api/analytics/intents?client_id=${clientId}`)
      .then(r => r.json())
      .then(setIntents)
  }, [clientId])
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de Intents (últimos 30 dias)</CardTitle>
      </CardHeader>
      <CardContent>
        <BarChart 
          data={Object.entries(intents).map(([intent, count]) => ({
            name: intent,
            value: count
          }))}
        />
        {intents['outro'] && intents['outro'] > intents['triagem'] && (
          <Alert>
            ⚠️ Alto volume de intents "outro" — revisar prompts do bot
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
```

---

## Checklist de Implementação

- [ ] Criar migration `005_add_intent_to_conversations.sql`
- [ ] Deploy da migration no Supabase
- [ ] Atualizar dispatcher.ts (1 linha)
- [ ] Atualizar types/bot.ts (1 linha)
- [ ] Testar em dev (enviar message, verificar last_intent salvo)
- [ ] Commit: "feat: persist classification.intent to conversations"
- [ ] (Opcional) Adicionar dashboard card em client-metrics
- [ ] (Opcional) Criar rota de analytics `/api/analytics/intents`

---

## Tempo Estimado
- Migration: 2 min
- Dispatcher: 1 min
- Types: 1 min
- Testing: 5 min
- **Total: ~10 minutos**

---

## Por Que Fazer?

1. **Rastreabilidade:** Você sabe exatamente qual intent foi detectado em cada conversa
2. **Diagnóstico:** Identifique se o bot está confuso (muitos "outro")
3. **Otimização:** Veja qual stage/intent leva mais tempo até conversão
4. **Compliance:** Para auditorias, você tem registro de cada decisão da IA
5. **Alertas:** Autom configure alertas para anomalias (ex: >30% "outro" está errado)

---

## Exemplo: Alerting Rule
```typescript
// src/app/api/health/check-intents.ts
export async function GET() {
  const supabase = createAdminClient()
  
  const { data: stats } = await supabase.rpc('calculate_intent_quality')
  
  if (stats.pct_outro > 30) {
    await sendAlert({
      severity: 'warning',
      message: `${stats.client_name}: ${stats.pct_outro}% de intents "outro" — bot pode estar confuso`,
      action_url: `/clients/${stats.client_id}/bot-config`
    })
  }
  
  return Response.json(stats)
}
```
