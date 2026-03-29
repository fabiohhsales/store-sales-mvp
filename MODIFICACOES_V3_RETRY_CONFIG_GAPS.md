# Modificações: Retry, Config Utility e Gaps Fases 2/3/5

**Data:** 28/03/2026  
**Contexto:** Melhorias identificadas na auto-revisão do PR #5 (`feat/migracao-alteracoes-locais`)

---

## Resumo Executivo

Seis melhorias incrementais aplicadas sobre a base do PR #5:

1. **Retry com backoff exponencial** no provisionamento Chatwoot
2. **Utilitário centralizado** para URL pública do Chatwoot
3. **Link direto à conversa no Chatwoot** no modal do pipeline
4. **Página de Agenda** por cliente (`/clients/[id]/appointments`)
5. **Setup de embed** sem dependência obrigatória de WhatsApp
6. **Componente UI** para configurar Dashboard Apps do Chatwoot

---

## Fase A — Retry com Backoff Exponencial

**Arquivo:** `src/app/api/clients/route.ts`

### Problema
`provisionChatwootForClient()` chamava `createChatwootAccount()` e `configureChatwootWebhook()` diretamente. Uma falha transitória (timeout de rede, Chatwoot em cold start) descartava o provisionamento sem chance de recuperação.

### Solução
Adicionada a função `withRetry<T>` **inline** no arquivo (sem nova dependência, sem migration):

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error('unreachable')
}
```

**Aplicada em:**
- `createChatwootAccount()` — delay: 0s / 1s / 2s entre tentativas
- `configureChatwootWebhook()` — idem

**Não aplicada em** (falhas não-críticas já tratadas com `try/catch` individual):
- `ensureChatwootLabels()` — já tem warn + continue
- `createChatwootAgent()` — já tem warn + continue por agente

---

## Fase B — Utilitário Centralizado para URL do Chatwoot

**Arquivo criado:** `src/lib/config.ts`  
**Arquivos atualizados:** `src/components/dashboard/client-list.tsx`, `src/components/client-detail/status-cards.tsx`

### Problema
O padrão `process.env.NEXT_PUBLIC_CHATWOOT_URL?.replace(/\/$/, '') ?? ''` estava duplicado em dois componentes de cliente.

### Solução
Criado `src/lib/config.ts`:

```typescript
export function getChatwootPublicUrl(): string {
  return process.env.NEXT_PUBLIC_CHATWOOT_URL?.replace(/\/$/, '') ?? ''
}
```

Ambos os componentes agora importam `getChatwootPublicUrl` de `@/lib/config`.

---

## Fase C — Link Direto à Conversa no Chatwoot (Modal de Pipeline)

**Arquivos alterados:**
- `src/types/pipeline.ts` — campo `chatwootAccountId` em `PipelineData`
- `src/app/api/pipeline/conversations/route.ts` — inclui `chatwootAccountId` na resposta
- `src/components/pipeline/kanban-board.tsx` — passa `chatwootAccountId` ao modal
- `src/components/pipeline/conversation-detail-modal.tsx` — renderiza o link

### Problema
O modal de detalhe de conversa (`ConversationDetailModal`) exibia o status e a etapa, mas não tinha como abrir a conversa no Chatwoot diretamente — o `chatwoot_conversation_id` estava disponível no tipo mas sem destino de UI.

### Solução

**1. Tipo `PipelineData` atualizado:**
```typescript
export interface PipelineData {
  columns: StageLabelConfig[]
  conversations: PipelineConversation[]
  chatwootAccountId?: number | null  // novo
}
```

**2. API `/api/pipeline/conversations` inclui na resposta:**
```typescript
return NextResponse.json({
  columns,
  conversations: pipelineConversations,
  chatwootAccountId: whatsappConfig.chatwoot_account_id,
})
```

**3. `KanbanBoard` passa ao modal:**
```tsx
<ConversationDetailModal
  ...
  chatwootAccountId={data.chatwootAccountId}
/>
```

**4. Modal renderiza o link (na seção Status + Stage):**
```tsx
{chatwootUrl && chatwootAccountId && conversation.chatwoot_conversation_id && (
  <a
    href={`${chatwootUrl}/accounts/${chatwootAccountId}/conversations/${conversation.chatwoot_conversation_id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
  >
    <ExternalLink className="h-3 w-3" />
    Abrir no Chatwoot
  </a>
)}
```

O link só é renderizado quando `chatwootUrl`, `chatwootAccountId` **e** `conversation.chatwoot_conversation_id` estão todos presentes.

---

## Fase D — Página de Agenda por Cliente

**Arquivo criado:** `src/app/(admin)/clients/[id]/appointments/page.tsx`

### Problema
O card "Agenda" na visão do cliente (`/clients/[id]`) vinculava para `/clients/[id]/appointments`, mas essa rota não existia — qualquer clique resultava em 404.

### Solução
Criado Server Component seguindo o mesmo padrão da página pai:

```typescript
export default async function ClientAppointmentsPage({ params }) {
  const { id } = await params
  const client = await getClientById(id)   // notFound() em falha

  return (
    <div className="space-y-6">
      {/* Breadcrumb com ← Voltar */}

      {!client.chatwoot_account_id ? (
        // Aviso: Chatwoot ainda não provisionado
      ) : (
        <AgendaTable clientId={id} />
      )}
    </div>
  )
}
```

**Comportamentos:**
- Se `chatwoot_account_id` está ausente: exibe alerta informativo (não quebra)
- Se presente: renderiza `<AgendaTable clientId={id} />` com todos os filtros e ações existentes
- Breadcrumb "← Voltar" aponta para `/clients/${id}`
- `notFound()` para clientes inexistentes

---

## Fase E — Setup de Embed Sem Dependência de WhatsApp

**Arquivo alterado:** `src/app/api/clients/[id]/setup-chatwoot-apps/route.ts`

### Problema
O endpoint `POST /api/clients/[id]/setup-chatwoot-apps` retornava HTTP 400 quando o cliente não tinha `panel_whatsapp_config`. Isso bloqueava clientes provisionados pelo novo fluxo (Chatwoot criado na criação do cliente, WhatsApp ainda não configurado).

### Solução
Substituída a verificação rígida por uma **cadeia de fallback**:

**Antes:**
```typescript
if (!client?.panel_whatsapp_config) {
  return NextResponse.json({ error: 'Cliente sem configuração WhatsApp' }, { status: 400 })
}
const { chatwoot_account_id, chatwoot_agent_token } = client.panel_whatsapp_config
```

**Depois:**
```typescript
const chatwoot_account_id =
  client.panel_whatsapp_config?.chatwoot_account_id ?? client.chatwoot_account_id
const chatwoot_agent_token =
  client.panel_whatsapp_config?.chatwoot_agent_token ?? client.chatwoot_agent_token

if (!chatwoot_account_id || !chatwoot_agent_token) {
  return NextResponse.json(
    { error: 'Chatwoot não provisionado para este cliente' },
    { status: 400 }
  )
}
```

**Prioridade:** `panel_whatsapp_config` (quando WhatsApp já configurado) → `panel_clients` diretamente (provisionamento via criação de cliente).

---

## Fase F — Componente UI: Configurar Dashboard Apps do Chatwoot

**Arquivo criado:** `src/components/client-detail/chatwoot-apps-setup.tsx`  
**Arquivo alterado:** `src/app/(admin)/clients/[id]/page.tsx`

### Problema
Não havia interface no painel para executar o setup de embed do Pipeline e Agenda no Chatwoot. A ação precisava ser feita manualmente via terminal ou cliente HTTP.

### Solução

**Componente `ChatwootAppsSetup`** (Client Component):

| Estado | Comportamento |
|--------|---------------|
| `hasChatwoot = false` | Card desativado com nota explicativa |
| `hasChatwoot = true`, antes do setup | Botão "Configurar Pipeline + Agenda" |
| Loading | Spinner no botão |
| Erro | Mensagem de erro inline |
| Sucesso | URLs de embed (kanban + agenda) com botões de copiar e abrir |
| Após sucesso | Botão "Regenerar" disponível |

**Integração na página de detalhes:**
```tsx
// Após o card de Agenda
<ChatwootAppsSetup
  clientId={id}
  hasChatwoot={!!client.chatwoot_account_id}
/>
```

**Props:**

| Prop | Tipo | Descrição |
|------|------|-----------|
| `clientId` | `string` | ID do cliente |
| `hasChatwoot` | `boolean` | Se `chatwoot_account_id` existe |

---

## Matriz de Arquivos Alterados

| Arquivo | Tipo | Fase |
|---------|------|------|
| `src/app/api/clients/route.ts` | Editado | A |
| `src/lib/config.ts` | **Criado** | B |
| `src/components/dashboard/client-list.tsx` | Editado | B |
| `src/components/client-detail/status-cards.tsx` | Editado | B |
| `src/types/pipeline.ts` | Editado | C |
| `src/app/api/pipeline/conversations/route.ts` | Editado | C |
| `src/components/pipeline/kanban-board.tsx` | Editado | C |
| `src/components/pipeline/conversation-detail-modal.tsx` | Editado | C |
| `src/app/(admin)/clients/[id]/appointments/page.tsx` | **Criado** | D |
| `src/app/api/clients/[id]/setup-chatwoot-apps/route.ts` | Editado | E |
| `src/components/client-detail/chatwoot-apps-setup.tsx` | **Criado** | F |
| `src/app/(admin)/clients/[id]/page.tsx` | Editado | F |

---

## Variáveis de Ambiente

Nenhuma nova variável necessária. As modificações usam as já existentes:

| Variável | Uso |
|----------|-----|
| `NEXT_PUBLIC_CHATWOOT_URL` | `getChatwootPublicUrl()` — Fases B e C |
| `CHATWOOT_URL` | `setup-chatwoot-apps` — Fase E (já existia) |

---

## Testes Recomendados

### Fase A — Retry
- [ ] Simular falha temporária do Chatwoot (DNS/timeout) e criar cliente → Log deve mostrar retries e eventual sucesso
- [ ] Falha permanente → Log de erro com `[Clients] Falha ao provisionar Chatwoot para cliente {id}`

### Fase B — Config Utility
- [ ] Listagem de clientes exibe botão "Chatwoot ↗" com URL correta
- [ ] Status cards exibem URL correta do Chatwoot

### Fase C — Link no Modal
- [ ] Abrir modal de conversa no pipeline → Link "Abrir no Chatwoot" visível
- [ ] Clicar no link → Abre a conversa correta no Chatwoot em nova aba
- [ ] Modal de conversa sem `chatwoot_conversation_id` → Link não aparece

### Fase D — Página de Agenda
- [ ] `/clients/{id}/appointments` carrega sem 404
- [ ] Cliente sem Chatwoot → Alerta informativo, sem erro 500
- [ ] Cliente com Chatwoot → `AgendaTable` renderiza com filtros e ações funcionais
- [ ] Breadcrumb "← Voltar" navega para `/clients/{id}`

### Fase E — Setup de Embed
- [ ] `POST /api/clients/{id}/setup-chatwoot-apps` para cliente sem WhatsApp mas com Chatwoot → HTTP 200
- [ ] Para cliente sem Chatwoot → HTTP 400 com `"Chatwoot não provisionado para este cliente"`
- [ ] Para cliente com WhatsApp configurado → Comportamento idêntico ao anterior

### Fase F — UI de Setup
- [ ] Sem Chatwoot → Card aparece desativado com explicação
- [ ] Com Chatwoot → Botão "Configurar Pipeline + Agenda" clicável
- [ ] Após sucesso → URLs de embed exibidas com cópia e abertura funcionais
- [ ] Botão "Regenerar" gera novos tokens
