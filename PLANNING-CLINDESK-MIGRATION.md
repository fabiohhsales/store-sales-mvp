# PLANNING — Migração Chatwoot → Painel de Atendimento Próprio (ClinDesk Sales Tec)

## Objetivo

Substituir o Chatwoot por um painel de atendimento próprio integrado ao Next.js existente.
O resultado final é um sistema com **dois níveis de acesso isolados**:

1. **Admin (Sales Tec)** — gerencia clientes, onboarding, configurações (já existe)
2. **Operador (Clínica)** — recepcionista/profissional atende pacientes em tempo real (a construir)

O Chatwoot será removido do caminho crítico. O fluxo de mensagens passará a ser:

```
Paciente (WhatsApp) → Evolution API → Next.js webhook → Bot Engine → Evolution API → WhatsApp
                                                              ↓
                                                     Supabase (persistência)
                                                              ↓
                                                     Painel Operador (Realtime)
```

---

## Referência: Arquitetura Atual (ler CLAUDE.md para detalhes completos)

### Fluxo atual (com Chatwoot)

```
WhatsApp → Evolution API ↔ Chatwoot → webhook → Next.js Bot Engine → Evolution API → WhatsApp
```

### Dependências do Chatwoot no código atual

| Componente | Dependência do Chatwoot | Ação na migração |
|---|---|---|
| `route.ts` (webhook) | Recebe payload formato Chatwoot v4.9 | Criar novo endpoint Evolution |
| `pipeline.ts` | Usa `chatwoot_account_id` pra identificar cliente | Usar `evolution_instance_name` |
| `pipeline.ts` | Upsert usa `chatwoot_id` em contacts | Usar `phone_number` como PK natural |
| `dispatcher.ts` | Atualiza labels/status no Chatwoot | Atualizar direto no Supabase |
| `dispatcher.ts` | Envia mensagem via Chatwoot API | Enviar direto via Evolution API (já faz) |
| `panel_whatsapp_config` | `chatwoot_account_id`, `chatwoot_inbox_id`, `chatwoot_agent_token` | Remover colunas |
| Onboarding wizard | Cria Chatwoot Account + Agent | Remover etapa |
| `.env` | 8 variáveis `CHATWOOT_*` | Remover |

---

## Fase 0 — Modelo de Segurança e Autenticação (CRÍTICO — FAZER PRIMEIRO)

### Problema

O painel atual usa Supabase Auth com email/senha para admins Sales Tec.
Agora precisamos de um segundo tipo de usuário (operador da clínica) com permissões
completamente diferentes. **Não pode haver conflito de permissões.**

### Arquitetura de permissões

```
Supabase Auth (auth.users)
  ├── role: 'admin'     → acesso total (Sales Tec)
  │     └── Pode: CRUD clientes, configurar bots, ver todas as conversas, onboarding
  │
  └── role: 'operator'  → acesso isolado ao seu client_id
        └── Pode: ver/responder conversas do SEU cliente apenas
        └── NÃO pode: ver outros clientes, alterar configs do bot, acessar admin
```

### Tabelas a criar

```sql
-- Tabela de perfis com role e vínculo ao cliente
CREATE TABLE panel_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  client_id UUID REFERENCES panel_clients(id) ON DELETE CASCADE,
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Admin não tem client_id; Operator DEVE ter
  CONSTRAINT role_client_check CHECK (
    (role = 'admin' AND client_id IS NULL) OR
    (role = 'operator' AND client_id IS NOT NULL)
  )
);

-- Índices
CREATE INDEX idx_panel_users_client ON panel_users(client_id);
CREATE INDEX idx_panel_users_role ON panel_users(role);
```

### Row Level Security (RLS) — OBRIGATÓRIO

Todas as tabelas que o operador acessa DEVEM ter RLS habilitado.
O princípio é: **o operador só vê dados do seu `client_id`**.

```sql
-- Função helper: retorna o client_id do usuário logado
CREATE OR REPLACE FUNCTION auth.user_client_id()
RETURNS UUID AS $$
  SELECT client_id FROM panel_users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Função helper: retorna o role do usuário logado
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM panel_users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Exemplo de policy para conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo
CREATE POLICY admin_all ON conversations
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin');

-- Operador vê apenas conversas do seu cliente
CREATE POLICY operator_own ON conversations
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'operator'
    AND client_id = auth.user_client_id()
  );
```

Aplicar o mesmo padrão RLS em: `conversations`, `messages`, `contacts`, `appointments`, `ai_pauses`.

### Middleware Next.js — Separação de rotas

```
/admin/*          → requer role='admin'     (já existe, renomear rotas)
/desk/*           → requer role='operator'  (novo — painel de atendimento)
/api/desk/*       → requer role='operator'  (APIs do painel operador)
/api/admin/*      → requer role='admin'     (APIs admin — renomear de /api/clients etc)
/api/webhooks/*   → público                 (webhooks Evolution)
/connect/*        → público                 (onboarding)
```

```typescript
// src/middleware.ts — lógica simplificada
const PUBLIC_ROUTES = ['/api/webhooks/', '/connect/', '/api/auth/', '/api/health/'];
const ADMIN_ROUTES = ['/admin', '/api/admin/'];
const OPERATOR_ROUTES = ['/desk', '/api/desk/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas — sem auth
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next();

  // Verificar sessão Supabase
  const session = await getSession(request);
  if (!session) return redirectToLogin(request);

  // Verificar role
  const user = await getUserProfile(session.user.id);

  if (ADMIN_ROUTES.some(r => pathname.startsWith(r)) && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (OPERATOR_ROUTES.some(r => pathname.startsWith(r)) && user.role !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.next();
}
```

### Gestão de operadores pelo Admin

O admin precisa poder criar/gerenciar operadores para cada cliente:

```
POST   /api/admin/clients/[id]/operators     — cria operador (convite por email)
GET    /api/admin/clients/[id]/operators     — lista operadores do cliente
DELETE /api/admin/clients/[id]/operators/[uid] — remove operador
PATCH  /api/admin/clients/[id]/operators/[uid] — ativa/desativa
```

Fluxo de criação:
1. Admin informa email e display_name
2. Backend cria user no Supabase Auth (com password temporário ou magic link)
3. Insere registro em `panel_users` com `role='operator'` e `client_id`
4. Operador recebe email e faz login em `/desk`

---

## Fase 1 — Novo Webhook da Evolution API (Backend)

### Objetivo

Receber mensagens diretamente da Evolution API, sem passar pelo Chatwoot.

### Payload da Evolution API (webhook)

```typescript
// Evento: messages.upsert (mensagem recebida)
interface EvolutionWebhookPayload {
  event: 'messages.upsert' | 'messages.update' | 'connection.update' | string;
  instance: string; // nome da instância (= evolution_instance_name)
  data: {
    key: {
      remoteJid: string;   // "5532999999999@s.whatsapp.net"
      fromMe: boolean;
      id: string;          // message ID
    };
    pushName: string;       // nome do contato no WhatsApp
    message: {
      conversation?: string;           // mensagem de texto simples
      extendedTextMessage?: {
        text: string;
      };
      imageMessage?: { caption?: string; };
      audioMessage?: object;
      documentMessage?: { fileName?: string; };
    };
    messageType: string;    // "conversation" | "extendedTextMessage" | etc
    messageTimestamp: number;
  };
  // Evento: connection.update
  // data: { state: 'open' | 'close' | 'connecting', statusReason: number }
}
```

### Novo endpoint

```
POST /api/webhooks/evolution
```

```typescript
// src/app/api/webhooks/evolution/route.ts

export async function POST(request: NextRequest) {
  const payload = await request.json();

  // 1. Filtrar eventos relevantes
  if (payload.event !== 'messages.upsert') {
    // Tratar connection.update separadamente (atualizar status no painel)
    if (payload.event === 'connection.update') {
      await handleConnectionUpdate(payload);
    }
    return NextResponse.json({ status: 'ignored' });
  }

  // 2. Ignorar mensagens enviadas por nós (fromMe)
  if (payload.data.key.fromMe) {
    // MAS persistir no banco pra mostrar no painel
    await persistOutgoingMessage(payload);
    return NextResponse.json({ status: 'outgoing_stored' });
  }

  // 3. Ignorar grupos
  if (payload.data.key.remoteJid.endsWith('@g.us')) {
    return NextResponse.json({ status: 'group_ignored' });
  }

  // 4. Identificar cliente pela instância
  const instanceName = payload.instance;
  // SELECT * FROM panel_whatsapp_config WHERE evolution_instance_name = instanceName
  // JOIN panel_clients ON panel_clients.id = panel_whatsapp_config.client_id

  // 5. Responder 200 imediatamente, processar em background
  void runEvolutionPipeline(payload, client);

  return NextResponse.json({ status: 'processing' });
}
```

### Normalização do payload

Criar `src/lib/bot/normalize-evolution.ts`:

```typescript
interface NormalizedMessage {
  instanceName: string;
  remoteJid: string;       // telefone com @s.whatsapp.net
  phoneNumber: string;     // apenas números: "5532999999999"
  contactName: string;     // pushName
  messageId: string;
  content: string;         // texto extraído de qualquer tipo de mensagem
  contentType: 'text' | 'image' | 'audio' | 'document' | 'unknown';
  timestamp: Date;
  rawPayload: object;      // payload original pra debug
}

export function normalizeEvolutionPayload(payload: EvolutionWebhookPayload): NormalizedMessage {
  const { data, instance } = payload;
  const phoneNumber = data.key.remoteJid.replace('@s.whatsapp.net', '');

  // Extrair texto de qualquer tipo de mensagem
  let content = '';
  let contentType: NormalizedMessage['contentType'] = 'unknown';

  if (data.message.conversation) {
    content = data.message.conversation;
    contentType = 'text';
  } else if (data.message.extendedTextMessage?.text) {
    content = data.message.extendedTextMessage.text;
    contentType = 'text';
  } else if (data.message.imageMessage) {
    content = data.message.imageMessage.caption || '[Imagem]';
    contentType = 'image';
  } else if (data.message.audioMessage) {
    content = '[Áudio]';
    contentType = 'audio';
  } else if (data.message.documentMessage) {
    content = `[Documento: ${data.message.documentMessage.fileName || 'arquivo'}]`;
    contentType = 'document';
  }

  return {
    instanceName: instance,
    remoteJid: data.key.remoteJid,
    phoneNumber,
    contactName: data.pushName || '',
    messageId: data.key.id,
    content,
    contentType,
    timestamp: new Date(data.messageTimestamp * 1000),
    rawPayload: payload,
  };
}
```

### Configurar webhook na Evolution API

Na criação da instância (onboarding), configurar webhook apontando pro novo endpoint:

```typescript
// PUT /instance/webhook/{instance}
await fetch(`${EVOLUTION_API_URL}/instance/webhook/${instanceName}`, {
  method: 'PUT',
  headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    webhook: {
      enabled: true,
      url: `${APP_URL}/api/webhooks/evolution`,
      webhookByEvents: true,
      events: [
        'messages.upsert',       // mensagem recebida/enviada
        'connection.update',     // status da conexão WhatsApp
      ],
    },
  }),
});
```

**IMPORTANTE**: Remover a integração Chatwoot da instância Evolution:
- NÃO chamar mais `POST /chatwoot/set/{instance}`
- O webhook da Evolution vai direto pro Next.js

---

## Fase 2 — Adaptação do Bot Engine (Backend)

### Objetivo

Adaptar `pipeline.ts`, `agent.ts`, `dispatcher.ts` para funcionar sem Chatwoot.

### Mudanças no pipeline.ts

**Antes**: recebe `chatwoot_account_id` do payload Chatwoot, busca cliente por `panel_whatsapp_config.chatwoot_account_id`

**Depois**: recebe `instance` (nome) do payload Evolution, busca cliente por `panel_whatsapp_config.evolution_instance_name`

```typescript
// Resolução do cliente — ANTES
const client = await supabase
  .from('panel_whatsapp_config')
  .select('*, panel_clients(*)')
  .eq('chatwoot_account_id', payload.account.id)
  .single();

// Resolução do cliente — DEPOIS
const client = await supabase
  .from('panel_whatsapp_config')
  .select('*, panel_clients(*)')
  .eq('evolution_instance_name', normalizedMessage.instanceName)
  .single();
```

### Mudanças no upsert de contacts

**Antes**: usa `chatwoot_id` como identificador principal

**Depois**: usa `phone_number` como chave natural (já é unique na prática)

```sql
-- Ajustar tabela contacts
ALTER TABLE contacts DROP COLUMN chatwoot_id;
ALTER TABLE contacts ADD CONSTRAINT contacts_phone_client_unique
  UNIQUE (phone_number, client_id);
```

Adicionar `client_id` em contacts para isolamento multi-tenant:

```sql
ALTER TABLE contacts ADD COLUMN client_id UUID REFERENCES panel_clients(id);
CREATE INDEX idx_contacts_client ON contacts(client_id);
```

### Mudanças no upsert de conversations

```sql
-- Ajustar tabela conversations
ALTER TABLE conversations DROP COLUMN chatwoot_conversation_id;
ALTER TABLE conversations DROP COLUMN account_id;
ALTER TABLE conversations ADD COLUMN client_id UUID NOT NULL REFERENCES panel_clients(id);
ALTER TABLE conversations ADD CONSTRAINT conversations_contact_client_unique
  UNIQUE (contact_id, client_id, status);
  -- uma conversa open por contact+client

CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_client_status ON conversations(client_id, status);
```

### Mudanças no dispatcher.ts

**Remover**: toda interação com Chatwoot API (labels, status, mensagens)

**Manter**: envio via Evolution API (já existe)

**Adicionar**: persistência da mensagem de resposta no Supabase

```typescript
// ANTES (dispatcher.ts)
// 1. Envia via Evolution
// 2. Atualiza labels no Chatwoot
// 3. Atualiza status da conversa no Chatwoot

// DEPOIS (dispatcher.ts)
// 1. Envia via Evolution API
await sendEvolutionMessage(instanceName, remoteJid, responseText);

// 2. Persiste a resposta no Supabase (pra aparecer no painel)
await supabase.from('messages').insert({
  conversation_id: conversation.id,
  content: responseText,
  content_type: 'text',
  sender_type: 'bot',
  from_who: 'bot',
  created_at: new Date().toISOString(),
});

// 3. Atualiza labels/status direto na conversa no Supabase
await supabase.from('conversations').update({
  labels: agentOutput.labels,
  last_outgoing_at: new Date().toISOString(),
  last_outgoing_by: 'bot',
  appointment_status: agentOutput.appointmentStatus,
}).eq('id', conversation.id);
```

### Mudanças no messages

```sql
ALTER TABLE messages DROP COLUMN chatwoot_message_id;
ALTER TABLE messages DROP COLUMN chatwoot_conversation_id;
ALTER TABLE messages DROP COLUMN source_id;
ALTER TABLE messages ADD COLUMN client_id UUID REFERENCES panel_clients(id);
ALTER TABLE messages ADD COLUMN evolution_message_id TEXT;

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_client ON messages(client_id);
```

---

## Fase 3 — Painel de Atendimento (Frontend — "Desk")

### Objetivo

Construir a UI que substitui o Chatwoot para o operador da clínica.

### Estrutura de rotas

```
/desk                           → Dashboard do operador (fila de conversas)
/desk/conversations             → Lista de conversas (com filtros)
/desk/conversations/[id]        → Conversa aberta (chat + detalhes do contato)
/desk/contacts                  → Lista de contatos do cliente
/desk/appointments              → Agenda do cliente
/login                          → Login unificado (redireciona pra /admin ou /desk)
```

### Layout do Desk (referência: print ClinDesk)

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Logo cliente | Nome operador | Notificações | Sair  │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│  FILA    │     CONVERSA ATIVA           │  DETALHES         │
│          │                              │                   │
│ Colunas: │  - Histórico de mensagens    │  - Dados contato  │
│          │  - Input de resposta         │  - Convênio       │
│ Triagem  │  - Botões: assumir,          │  - Histórico      │
│ (Bot)    │    devolver ao bot,          │  - Agendamentos   │
│          │    finalizar                 │  - Notas          │
│ Aguard.  │                              │                   │
│ Humano   │                              │                   │
│          │                              │                   │
│ Em       │                              │                   │
│ Atend.   │                              │                   │
│          │                              │                   │
│ Finaliz. │                              │                   │
│          │                              │                   │
├──────────┴──────────────────────────────┴───────────────────┤
│ Rodapé: Métricas — Em triagem: X | Aguardando: Y | etc     │
└─────────────────────────────────────────────────────────────┘
```

### Estados da conversa (substituem as colunas do ClinDesk)

```typescript
type ConversationStage =
  | 'bot_triage'        // Bot está conversando (coluna "Em Triagem Bot")
  | 'awaiting_human'    // Bot fez handoff, aguardando operador (coluna "Aguardando Humano")
  | 'in_service'        // Operador assumiu (coluna "Em Atendimento")
  | 'resolved';         // Finalizada (coluna "Finalizados")
```

```sql
-- Nova coluna em conversations
ALTER TABLE conversations ADD COLUMN stage TEXT
  DEFAULT 'bot_triage'
  CHECK (stage IN ('bot_triage', 'awaiting_human', 'in_service', 'resolved'));

ALTER TABLE conversations ADD COLUMN assigned_operator_id UUID REFERENCES panel_users(id);
ALTER TABLE conversations ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN summary TEXT; -- resumo gerado pelo bot na triagem

CREATE INDEX idx_conversations_stage ON conversations(client_id, stage);
```

### Supabase Realtime — Tempo real sem polling

O painel usa Supabase Realtime para receber atualizações instantâneas:

```typescript
// Hook React para escutar conversas em tempo real
function useRealtimeConversations(clientId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    // Carrega estado inicial
    loadConversations(clientId).then(setConversations);

    // Escuta mudanças em tempo real
    const channel = supabase
      .channel(`desk:${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `client_id=eq.${clientId}`,
      }, (payload) => {
        handleConversationChange(payload, setConversations);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `client_id=eq.${clientId}`,
      }, (payload) => {
        handleNewMessage(payload, setConversations);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  return conversations;
}
```

**IMPORTANTE**: Habilitar Realtime nas tabelas no Supabase Dashboard:
- `conversations` → Realtime ON
- `messages` → Realtime ON

### Ações do operador

```typescript
// 1. Assumir conversa (handoff → in_service)
async function assumeConversation(conversationId: string, operatorId: string) {
  // Seta ai_pause pra parar o bot
  await supabase.from('ai_pauses').upsert({
    conversation_id: conversationId,
    paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
    paused_reason: 'operator_assumed',
    paused_by: operatorId,
  });

  // Atualiza estágio
  await supabase.from('conversations').update({
    stage: 'in_service',
    assigned_operator_id: operatorId,
  }).eq('id', conversationId);
}

// 2. Enviar mensagem manual
async function sendOperatorMessage(
  conversationId: string,
  content: string,
  instanceName: string,
  remoteJid: string,
  operatorId: string,
) {
  // Envia via Evolution API
  await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: remoteJid.replace('@s.whatsapp.net', ''),
      text: content,
    }),
  });

  // Persiste no banco
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    content,
    content_type: 'text',
    sender_type: 'operator',
    from_who: operatorId,
    created_at: new Date().toISOString(),
  });

  // Atualiza timestamps
  await supabase.from('conversations').update({
    last_outgoing_at: new Date().toISOString(),
    last_outgoing_by: 'operator',
  }).eq('id', conversationId);
}

// 3. Devolver ao bot
async function returnToBot(conversationId: string) {
  // Remove ai_pause
  await supabase.from('ai_pauses').delete().eq('conversation_id', conversationId);

  // Volta pro estágio de triagem
  await supabase.from('conversations').update({
    stage: 'bot_triage',
    assigned_operator_id: null,
  }).eq('id', conversationId);
}

// 4. Finalizar conversa
async function resolveConversation(conversationId: string) {
  await supabase.from('ai_pauses').delete().eq('conversation_id', conversationId);

  await supabase.from('conversations').update({
    stage: 'resolved',
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  }).eq('id', conversationId);
}
```

### APIs do Desk (todas protegidas por role='operator' + RLS)

```
GET    /api/desk/conversations              — lista conversas do cliente (com filtro por stage)
GET    /api/desk/conversations/[id]         — detalhes da conversa + mensagens
POST   /api/desk/conversations/[id]/assume  — operador assume
POST   /api/desk/conversations/[id]/return  — devolve ao bot
POST   /api/desk/conversations/[id]/resolve — finaliza
POST   /api/desk/conversations/[id]/message — envia mensagem
GET    /api/desk/contacts                   — lista contatos
GET    /api/desk/contacts/[id]              — detalhes do contato + histórico
GET    /api/desk/appointments               — agenda
GET    /api/desk/stats                      — métricas (contadores por stage)
```

**Segurança**: Todas essas rotas usam `auth.user_client_id()` do RLS.
O operador NUNCA passa `client_id` como parâmetro — é resolvido da sessão.

```typescript
// Exemplo: GET /api/desk/conversations
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  // RLS garante que só retorna conversas do client_id do operador
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*, contacts(*), messages(content, created_at, sender_type)')
    .order('last_incoming_at', { ascending: false });

  return NextResponse.json(conversations);
}
```

---

## Fase 4 — Handoff Inteligente (Bot → Operador)

### Objetivo

Quando o bot detecta necessidade de handoff, a conversa muda de estágio e aparece
na fila do operador com um resumo da triagem.

### Gatilhos de handoff (já existem em panel_bot_config)

- `handoff_on_negative_sentiment` — sentimento negativo detectado
- `handoff_on_medical_urgency` — urgência médica
- `handoff_on_unknown_intent` — intenção não reconhecida
- `handoff_max_ai_turns` — número máximo de turnos do bot
- `handoff_keywords` — palavras-chave que disparam handoff (ex: "falar com humano")

### Fluxo no bot engine

```typescript
// Em agent.ts — após processar a resposta da IA
if (agentOutput.action === 'handoff') {
  // 1. Gerar resumo da triagem
  const summary = await generateTriageSummary(conversationMessages);

  // 2. Atualizar estágio da conversa
  await supabase.from('conversations').update({
    stage: 'awaiting_human',
    summary: summary,
    labels: [...currentLabels, 'handoff'],
  }).eq('id', conversationId);

  // 3. Enviar mensagem de handoff ao paciente
  const handoffMessage = botConfig.ai_handoff_message
    || 'Vou transferir você para nossa equipe. Um momento, por favor.';

  await sendEvolutionMessage(instanceName, remoteJid, handoffMessage);

  // 4. Persistir mensagem de handoff
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    content: handoffMessage,
    content_type: 'text',
    sender_type: 'bot',
    from_who: 'bot',
  });

  // 5. NÃO setar ai_pause aqui — o bot simplesmente para de responder
  //    porque o stage mudou (pipeline checa stage antes de chamar o agent)

  return; // Não continua o pipeline normal
}
```

### Resumo de triagem (gerado pela IA)

```typescript
async function generateTriageSummary(messages: Message[]): Promise<string> {
  const history = messages.map(m =>
    `${m.sender_type === 'contact' ? 'Paciente' : 'Bot'}: ${m.content}`
  ).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `Resuma a triagem abaixo em 2-3 linhas objetivas para a recepção.
Inclua: motivo do contato, dados coletados (nome, convênio, serviço desejado),
e motivo do encaminhamento ao atendente humano. Seja direto e conciso.`
    }, {
      role: 'user',
      content: history,
    }],
    max_tokens: 200,
  });

  return response.choices[0].message.content || 'Triagem sem resumo disponível.';
}
```

---

## Fase 5 — Notificações no Painel

### Notificação em tempo real (Realtime)

```typescript
// Componente de notificação no header do Desk
function NotificationBell({ clientId }: { clientId: string }) {
  const [count, setCount] = useState(0);
  const [hasSound, setHasSound] = useState(true);

  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${clientId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `client_id=eq.${clientId}`,
      }, (payload) => {
        if (payload.new.stage === 'awaiting_human' && payload.old.stage !== 'awaiting_human') {
          setCount(c => c + 1);
          if (hasSound) playNotificationSound();
          // Browser notification API
          if (Notification.permission === 'granted') {
            new Notification('Novo paciente aguardando', {
              body: payload.new.summary || 'Paciente encaminhado pelo bot',
            });
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  return <Bell count={count} />;
}
```

### Browser Notifications

Solicitar permissão no primeiro login do operador:

```typescript
// No layout do /desk
useEffect(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, []);
```

---

## Fase 6 — Migração e Limpeza

### Migração de dados existentes

Se houver conversas ativas no Chatwoot que precisam continuar:

```sql
-- Preencher client_id em contacts (baseado no account_id que já existe)
UPDATE contacts c
SET client_id = pwc.client_id
FROM conversations conv
JOIN panel_whatsapp_config pwc ON pwc.chatwoot_account_id = conv.account_id
WHERE c.id = conv.contact_id;

-- Preencher client_id em conversations
UPDATE conversations conv
SET client_id = pwc.client_id
FROM panel_whatsapp_config pwc
WHERE pwc.chatwoot_account_id = conv.account_id;

-- Preencher client_id em messages
UPDATE messages m
SET client_id = conv.client_id
FROM conversations conv
WHERE m.conversation_id = conv.id;

-- Setar stage padrão
UPDATE conversations SET stage = 'resolved' WHERE status = 'resolved';
UPDATE conversations SET stage = 'bot_triage' WHERE status IN ('pending', 'open');
```

### Remover dependências do Chatwoot

1. **Código**: remover todos os imports/calls pra Chatwoot API
2. **Variáveis de ambiente**: remover todas as `CHATWOOT_*`
3. **Docker/EasyPanel**: desligar o container do Chatwoot (libera RAM/CPU)
4. **Colunas do banco**: dropar `chatwoot_*` columns após confirmar que tudo funciona
5. **Onboarding wizard**: remover etapa de criação de Chatwoot Account

### Checklist de remoção Chatwoot

```
[ ] Remover CHATWOOT_URL, CHATWOOT_API_TOKEN, etc do .env
[ ] Remover CHATWOOT_* do nixpacks.toml
[ ] Remover src/lib/chatwoot/ (se existir)
[ ] Remover chamadas Chatwoot de dispatcher.ts
[ ] Remover chamadas Chatwoot de pipeline.ts
[ ] Remover chamadas Chatwoot do onboarding wizard
[ ] Remover POST /chatwoot/set/ da criação de instância Evolution
[ ] Remover chatwoot_account_id, chatwoot_inbox_id, chatwoot_agent_token de panel_whatsapp_config
[ ] Remover chatwoot_id de contacts
[ ] Remover chatwoot_conversation_id, account_id de conversations
[ ] Remover chatwoot_message_id, chatwoot_conversation_id, source_id de messages
[ ] Desligar container Chatwoot no EasyPanel
[ ] Remover endpoint /api/webhooks/chatwoot (ou manter como redirect temporário)
```

---

## Fase 7 — Testes e Validação

### Cenários de teste obrigatórios

```
1. FLUXO COMPLETO BOT
   - Paciente envia mensagem → bot responde
   - Mensagem aparece no painel Desk em tempo real
   - Bot completa agendamento → evento no Google Calendar
   - Conversa finalizada pelo bot

2. HANDOFF
   - Bot detecta necessidade de handoff
   - Conversa move pra "Aguardando Humano" com resumo
   - Notificação aparece no painel
   - Operador assume → bot para de responder
   - Operador envia mensagem → chega no WhatsApp do paciente
   - Operador finaliza → conversa move pra "Finalizados"

3. DEVOLVER AO BOT
   - Operador devolve conversa ao bot
   - Paciente envia nova mensagem → bot volta a responder

4. ISOLAMENTO MULTI-TENANT
   - Operador do cliente A NÃO vê conversas do cliente B
   - Admin vê tudo
   - RLS bloqueia query direta no Supabase

5. SEGURANÇA
   - Operador tenta acessar /admin → 403
   - Admin tenta acessar /desk → 403 (ou permite, decisão de produto)
   - Operador tenta API de outro client_id → vazio (RLS)
   - Webhook sem auth válido mas com instance inválida → ignorado

6. RECONEXÃO
   - WhatsApp desconecta → connection.update → status atualizado no painel
   - Operador vê aviso de desconexão

7. CONCORRÊNCIA
   - Dois operadores tentam assumir mesma conversa → apenas um consegue
   - Mensagem duplicada (webhook duplicado) → deduplica por evolution_message_id
```

---

## Ordem de Execução Recomendada

```
SPRINT 1 (Fundação) ─────────────────────────────────
  ✦ Fase 0: Modelo de segurança (panel_users, RLS, middleware)
  ✦ Fase 1: Webhook Evolution + normalização de payload
  ✦ Fase 2: Adaptar bot engine (remover Chatwoot do pipeline)

SPRINT 2 (Painel) ───────────────────────────────────
  ✦ Fase 3: UI do Desk (fila, chat, ações do operador)
  ✦ Fase 4: Handoff inteligente (bot → operador)
  ✦ Fase 5: Notificações

SPRINT 3 (Finalização) ──────────────────────────────
  ✦ Fase 6: Migração de dados + limpeza Chatwoot
  ✦ Fase 7: Testes end-to-end
  ✦ Admin: CRUD de operadores na UI admin
```

---

## Stack Final (pós-migração)

```
ANTES (5 serviços):
  Next.js + Chatwoot + Evolution API + Supabase + n8n(legado)

DEPOIS (3 serviços):
  Next.js (admin + desk + bot engine) + Evolution API + Supabase

Removidos:
  - Chatwoot (substituído pelo Desk)
  - n8n (já era legado)

Mantidos sem alteração:
  - Google Calendar (conta central, calendar_id por cliente)
  - OpenAI/Groq (AI Agent)
  - Evolution API (Baileys)
  - Supabase (PostgreSQL + Auth + Realtime)
  - EasyPanel (deploy)
```

---

## Decisões de Design Importantes

### Por que NÃO usar Edge Functions (como o ClinDesk)?

O ClinDesk usou Supabase Edge Functions (Deno) pro bot engine. Isso faz sentido
quando se constrói do zero. No seu caso, o bot engine já está em Next.js e funciona.
Mover pra Edge Functions seria reescrever código estável sem ganho imediato.

**Quando considerar Edge Functions**: se o Next.js começar a ter problemas de
timeout ou concorrência com muitos clientes simultâneos. Aí o bot engine
(pipeline + agent + dispatcher) pode ser extraído para Edge Functions sem
mudar a lógica — só o runtime muda.

### Por que phone_number como chave natural?

O `chatwoot_id` era um proxy desnecessário. O número de WhatsApp É a identidade
do paciente no contexto de atendimento. É único por instância (cliente), imutável
durante a conversa, e não depende de nenhum serviço externo.

### Por que NÃO separar em microserviços?

Manter tudo no Next.js (admin + desk + bot) é a decisão correta nesse estágio:
- Um deploy, um container, um processo
- Compartilha types, schemas, e conexão Supabase
- Separação é por rotas e RLS, não por serviço
- Quando escalar, extrai o bot engine (a parte stateless)

---

## Referência: Componentes shadcn/ui Recomendados pro Desk

O painel admin já usa shadcn/ui + Tailwind. Manter consistência:

- `Card` — cards de conversa na fila
- `Badge` — stage da conversa, convênio, labels
- `ScrollArea` — lista de mensagens no chat
- `Input` + `Button` — input de mensagem
- `Avatar` — foto/iniciais do contato
- `Sheet` — detalhes do contato (mobile)
- `Tabs` — filtro por stage na fila
- `Toast` — notificações de ação
- `AlertDialog` — confirmação de handoff/resolução
- `Skeleton` — loading states
