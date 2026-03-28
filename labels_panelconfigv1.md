# labels_panelconfigv1 — Etapas/Etiquetas por Cliente (V1)

> Documento de handoff gerado em 27/03/2026.
> Use este arquivo para dar continuidade ao trabalho em outro chat.

---

## 1. Objetivo

Implementar um sistema de **Etapas/Etiquetas por cliente** (stage labels) no Panel, onde:

- Cada cliente configura suas próprias etiquetas de etapa de funil (ex: Triagem, Agendado, Inativo)
- O **Panel é a fonte de verdade** — Chatwoot sincroniza a partir dele
- Mudanças feitas diretamente no Chatwoot se refletem no Panel (sync bidirecional eventual)
- A IA recebe as etiquetas configuradas via **injeção no system prompt**
- A primeira etapa configurada é usada como **rótulo inicial** de toda nova conversa

---

## 2. Decisões de Arquitetura

| Decisão | Escolha |
|---|---|
| Fonte de verdade | Panel DB (`panel_bot_config.stage_labels`) |
| Formato de slug | lowercase, sem acentos, `[a-z0-9_]` (ex: `etapa_triagem`) |
| Sync Panel → Chatwoot | Push ao salvar (POST /api/bot-config) |
| Sync Chatwoot → Panel | Pull ao carregar UI (GET /api/bot-config) |
| Consistência durante execução do bot | Eventual — bot lê do DB, não do Chatwoot em tempo real |
| Onboarding | Labels padrão aplicadas ao criar instância WhatsApp |

---

## 3. Arquivos Criados / Modificados

### 3.1 Novos arquivos

#### `src/lib/bot/stage-labels.ts`
Módulo utilitário central para stage labels.
- `DEFAULT_STAGE_LABELS` — 7 etapas padrão (`etapa_triagem` → `etapa_inativo`)
- `normalizeStageSlug(value)` — normaliza string para slug válido
- `sanitizeStageLabels(labels)` — dedup por slug, filtra vazios, fallback para defaults
- `stageLabelSlugs(labels)` — retorna array de strings de slug

#### `src/components/bot-config/stages-labels-section.tsx`
Componente React reutilizável para gerenciar etiquetas na UI.
- Add/remove etapas (mínimo 1, botão delete desabilitado se só 1 restante)
- Display name → auto-gera slug na primeira edição se slug ainda estiver vazio
- Slug sempre passa por `normalizeStageSlug()` no onChange
- Propaga mudanças via `onChange({ stage_labels: updated })`

#### `supabase/migrations/005_panel_stage_labels.sql`
```sql
ALTER TABLE panel_bot_config
  ADD COLUMN IF NOT EXISTS stage_labels jsonb NOT NULL
  DEFAULT '[{"slug":"etapa_triagem","display_name":"Triagem"}]'::jsonb;
```
> ⚠️ **Esta migration ainda precisa ser executada em produção.**

---

### 3.2 Arquivos modificados

#### `src/types/database.ts`
```typescript
export interface StageLabelConfig {
  slug: string
  display_name: string
  followup_cadence?: string | null  // reservado para V2
}
// Adicionado em PanelBotConfig:
stage_labels: StageLabelConfig[]
```

#### `src/lib/validations/bot-config.ts`
```typescript
const stageLabelSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9_]+$/),
  display_name: z.string().min(1),
})

stage_labels: z.array(stageLabelSchema)
  .min(1, 'Informe ao menos uma etapa')
  .refine(
    items => new Set(items.map(i => i.slug)).size === items.length,
    'Não pode haver slugs duplicados'
  )
  .default([{ slug: 'etapa_triagem', display_name: 'Triagem' }])
```

#### `src/app/api/bot-config/route.ts`
- **GET (novo):** Puxa labels do Chatwoot → compara com DB → atualiza se diferente → retorna config
  - Preserva `followup_cadence` local ao fazer merge com labels remotas
  - Falha de sync não bloqueia — retorna dados locais com `console.warn`
- **POST (modificado):** Salva `stage_labels` no DB → chama `ensureChatwootLabels` após upsert

#### `src/lib/api/chatwoot.ts`
Três novas funções exportadas:

- `listChatwootStageLabels(accountId, token)` — `GET /api/v1/accounts/{id}/labels` → `StageLabelConfig[]`
  - Mapeia `title` → `slug`, `description` → `display_name`
- `createAccountLabel(accountId, token, stageLabel)` — POST para criar label (`show_on_sidebar: true`)
- `ensureChatwootLabels(accountId, token, stageLabels)` — lista existentes, cria faltantes, aborta silenciosamente em conflito (HTTP 422)

#### `src/app/api/whatsapp/instances/route.ts`
Adicionado **Etapa 2b** durante criação de instância WhatsApp:
```typescript
const botConfig = await getBotConfigByClientId(client_id)
const stageLabels = sanitizeStageLabels(botConfig?.stage_labels ?? DEFAULT_STAGE_LABELS)
await ensureChatwootLabels(chatwootAccount.id, chatwootAccount.access_token, stageLabels)
```

#### `src/components/onboarding/steps/bot-config.tsx`
- Adicionado `<StagesLabelsSection>` como accordion item
- `useEffect` ao montar: chama `GET /api/bot-config?client_id=...` para puxar estado mais recente (dispara pull do Chatwoot)
- Estado inicializado com `DEFAULT_STAGE_LABELS`

#### `src/components/client-detail/edit-client-form.tsx`
- Mesmas adições do arquivo acima (`StagesLabelsSection` + `useEffect` pull on mount)

#### `src/lib/bot/system-prompt.ts`
Stage labels injetadas dinamicamente no prompt da IA:
```typescript
const stageLabels = sanitizeStageLabels(config.stage_labels)
const stageLabelList = stageLabels
  .map(item => `- ${item.slug}: ${item.display_name}`)
  .join('\n')

// Seção no prompt:
`LABELS DE ETAPA (use exatamente uma etiqueta de etapa por resposta):
${stageLabelList}`

// Formato de output:
// "labels_next": ["slug_da_etapa"]
```

#### `src/lib/bot/pipeline.ts`
```typescript
import { stageLabelSlugs } from './stage-labels'
// ...
const stageSlugs = stageLabelSlugs(clientContext.botConfig?.stage_labels)
const conversation = await upsertConversation(supabase, msg, contact, stageSlugs[0])
// Nova conversa recebe a primeira etapa configurada como label inicial
```

---

## 4. Fluxo Completo

```
[Usuário abre Edit Client / Onboarding]
    → useEffect dispara → GET /api/bot-config?client_id=X
    → Puxa labels do Chatwoot (listChatwootStageLabels)
    → Compara com panel_bot_config.stage_labels no DB
    → Se diferente: atualiza DB → retorna config atualizada
    → UI renderiza StagesLabelsSection com dados sincronizados

[Usuário salva config]
    → POST /api/bot-config com stage_labels no body
    → upsertBotConfig() persiste no Supabase
    → ensureChatwootLabels() cria labels faltantes no Chatwoot
    → insertAuditLog() registra ação do admin

[WhatsApp Onboarding — criar instância]
    → Etapa 2b: getBotConfigByClientId → sanitizeStageLabels → ensureChatwootLabels
    → Labels padrão garantidas no Chatwoot desde o onboarding

[Bot recebe mensagem WhatsApp]
    → pipeline.ts → resolveClientContext() → lê panel_bot_config do Supabase
    → stageLabelSlugs(botConfig.stage_labels)[0] → label inicial da conversa nova
    → agent.ts → buildSystemPrompt(clientContext.botConfig, ...)
    → system-prompt.ts → sanitizeStageLabels → stageLabelList injetado no prompt
    → OpenAI responde com labels_next: ["slug_da_etapa"]
```

---

## 5. Limitação Conhecida: Sync Eventual

**Chatwoot → Panel sync é eventual, NÃO em tempo real durante execução do bot.**

Se o usuário editar labels diretamente no Chatwoot, o bot só usa os labels atualizados após a UI do Panel abrir (disparando o GET). Durante a execução do bot, ele sempre lê do DB do Panel.

### Opções para tornar real-time (não implementado):

**Opção A — Sync em `runAgent()` antes de `buildSystemPrompt`:**
```typescript
// em src/lib/bot/agent.ts, antes de buildSystemPrompt:
const whatsappConfig = await getWhatsAppConfigByClientId(clientId)
if (whatsappConfig?.chatwoot_account_id && whatsappConfig.chatwoot_agent_token) {
  const remoteLabels = await listChatwootStageLabels(
    whatsappConfig.chatwoot_account_id,
    whatsappConfig.chatwoot_agent_token
  )
  if (remoteLabels.length > 0) {
    botConfig = { ...botConfig, stage_labels: sanitizeStageLabels(remoteLabels) }
  }
}
```

**Opção B — Webhook do Chatwoot:**
- Criar endpoint `/api/webhooks/chatwoot` que receba evento de atualização de label
- Atualizar `panel_bot_config.stage_labels` no DB automaticamente

**Opção C — Cron job periódico:**
- Job que itera todos os clientes ativos e faz pull do Chatwoot → Panel

---

## 6. Status de Implementação

| Item | Status |
|---|---|
| Tipo `StageLabelConfig` + campo `stage_labels` em `PanelBotConfig` | ✅ Feito |
| Validation Zod com dedup de slugs | ✅ Feito |
| Migration SQL 005 | ✅ Criada — ⚠️ **pendente rodar em produção** |
| Módulo `stage-labels.ts` | ✅ Feito |
| Componente `StagesLabelsSection` | ✅ Feito |
| Onboarding step: seção visível + pull on mount | ✅ Feito |
| Edit client form: seção visível + pull on mount | ✅ Feito |
| POST API: salva `stage_labels` + push para Chatwoot | ✅ Feito |
| GET API: pull Chatwoot → compara → atualiza DB | ✅ Feito |
| WhatsApp onboarding: sync labels Etapa 2b | ✅ Feito |
| `system-prompt.ts`: injeção das labels no prompt da IA | ✅ Feito |
| `pipeline.ts`: primeira etapa como label inicial de conversa nova | ✅ Feito |
| Sync real-time Chatwoot → Panel durante execução do bot | ⏳ Não implementado |
| Botão "Sincronizar do Chatwoot" manual na UI | ⏳ Não implementado |
| Executar migration 005 em produção | ⏳ Pendente |

---

## 7. Stack e Convenções do Projeto

- **Next.js 15** (App Router) — rotas em `src/app/api/`, UI em `src/components/`
- **TypeScript + Zod v4** — usar sintaxe `zod/v4`, `.refine()`, etc.
- **Supabase** — `createAdminClient()` no bot pipeline, `createClient()` nas rotas do Panel
- **OpenAI** — output estruturado em JSON; system prompt construído em `buildSystemPrompt()`
- **Chatwoot** — multi-account; token em `panel_whatsapp_config.chatwoot_agent_token`; account id em `.chatwoot_account_id`; labels mapeiam `title` → slug, `description` → display_name
- **Evolution API** — WhatsApp messaging; instâncias criadas em `POST /api/whatsapp/instances`
- **Audit log** — toda ação admin chama `insertAuditLog()` de `src/lib/db/audit-log`

---

## 8. Próximos Passos Sugeridos

1. **Rodar a migration** `supabase/migrations/005_panel_stage_labels.sql` no Supabase de produção
2. **Testar fluxo completo:**
   - Criar cliente → salvar bot config com labels personalizadas
   - Verificar se as labels aparecem na conta do Chatwoot
   - Editar labels no Chatwoot → abrir Panel → confirmar que sincronizou
   - Enviar mensagem WhatsApp → inspecionar prompt enviado à IA para ver os slugs
3. **Decidir sobre sync real-time** (Opção A é a mais simples: sync em `runAgent()`)
4. **V2 do campo `followup_cadence`:** O campo já está reservado em `StageLabelConfig` — permite configurar cadência de follow-up por etapa (ex: etapa_lead = 7 dias, etapa_agendado = 2 dias)
