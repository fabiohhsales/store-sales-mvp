# PROMPT / HANDOFF — Roadmap Completo e Especificações
## Store Sales MVP — Loja de Móveis e Eletrodomésticos

> Documento para orientar um agente de criação/dev na evolução do repositório `fabiohhsales/store-sales-mvp`, com foco em transformar a base atual em um MVP separado do Chat Sales original, com catálogo, WhatsApp conversacional, desk, RAG, campanhas e pagamentos.

---

## 1. Contexto e premissa crítica

Estamos criando um MVP separado do Chat Sales original para validar um produto verticalizado para lojas de móveis e eletrodomésticos.

O projeto deve rodar como app independente no EasyPanel, dentro do projeto `chatsales`, usando infraestrutura compartilhada quando necessário:

```text
EasyPanel

chatsales
├── supabase              ← infraestrutura compartilhada
├── evolution-api         ← infraestrutura compartilhada
├── evolution-api-db
├── evolution-api-redis
├── n8n
└── store-sales-mvp       ← app separado do MVP

panel
├── adminpanel            ← Chat Sales original em produção
└── testeworkflow
```

### Regra máxima de isolamento

Não alterar nem impactar:

```text
- projeto panel/adminpanel
- webhook principal do Chat Sales original
- pipelines clínicos, agenda, Google Calendar e follow-ups existentes
- usuários/clientes atualmente ativos no Chat Sales ON
- tabelas operacionais do Chat Sales original, salvo leitura controlada se estritamente necessário
```

O `store-sales-mvp` deve ter **código, rotas, webhook e tabelas próprias**, preferencialmente com prefixo `store_`.

---

## 2. Diagnóstico do estado atual

O repo `store-sales-mvp` parece ter nascido de uma cópia do `painel2`/Chat Sales. Isso é útil como ponto de partida visual/técnico, mas ainda carrega heranças que precisam ser removidas ou isoladas.

### Problemas atuais percebidos

```text
- package/metadata/README ainda têm identidade de Panel/Sales Tec
- README ainda fala de saúde, agendamento, Google Calendar e Chatwoot
- menus ainda têm itens clínicos como Agenda e Follow Ups
- autenticação ainda trabalha basicamente com admin/operator
- estrutura de tenant ainda parece vinculada a panel_clients/panel_users
- desk usa conversations/messages/contacts herdadas
- webhook Evolution ainda chama pipeline de atendimento original
- não há camada robusta de produtos
- não há importação de planilha/fotos
- não há RAG de produto estruturado
- não há campanhas promocionais
- não há pagamentos/pedidos
```

### Diretriz de refino

Transformar o repo de **“Panel adaptado”** para **“produto novo de loja usando peças reaproveitadas”**.

```text
Reaproveitar:
- Next.js
- Supabase client/admin
- Evolution API client
- componentes visuais úteis
- padrão de desk, se adaptável
- autenticação Supabase

Criar/refatorar:
- identidade Store Sales
- tabelas store_*
- roles próprias
- fluxo de produto/catálogo
- fluxo de conversas de loja
- RAG de catálogo
- campanhas
- pagamentos
```

---

## 3. Objetivo funcional do MVP

O MVP deve demonstrar que uma loja consegue:

1. conectar um número de WhatsApp;
2. importar ou cadastrar produtos;
3. subir fotos de produtos;
4. responder dúvidas de clientes com IA usando RAG;
5. transferir para vendedor humano quando necessário;
6. registrar interesses de clientes por produto/categoria;
7. montar campanhas segmentadas;
8. preparar base para pagamento/link de checkout.

---

## 4. Personas, papéis e permissões

A estrutura `admin/operator` é insuficiente para o Store Sales.

### Papéis recomendados

| Papel | Descrição | Permissões principais |
|---|---|---|
| `system_admin` | Usuário interno do SaaS | Vê todas as contas, cria clientes, acessa logs globais |
| `client_admin` | Dono/admin da conta cliente | Gerencia usuários, lojas, produtos, campanhas, pagamentos |
| `client_manager` | Gerente operacional | Gerencia atendimento, pipeline, produtos e campanhas |
| `seller` | Vendedor/operador | Atende conversas, move pipeline, envia produtos |
| `viewer` | Somente leitura | Vê relatórios e histórico |

### Tabelas recomendadas

#### `store_accounts`

```sql
create table store_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  document text,
  owner_name text,
  owner_email text,
  owner_phone text,
  status text not null default 'active',
  plan text default 'mvp',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### `store_user_profiles`

```sql
create table store_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### `store_account_memberships`

```sql
create table store_account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('system_admin','client_admin','client_manager','seller','viewer')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(account_id, user_id)
);
```

#### `store_user_store_access`

```sql
create table store_user_store_access (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid not null references store_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_view_inbox boolean default true,
  can_manage_products boolean default false,
  can_manage_campaigns boolean default false,
  can_manage_payments boolean default false,
  can_manage_settings boolean default false,
  created_at timestamptz default now(),
  unique(store_id, user_id)
);
```

---

## 5. Lojas e canais

### `store_stores`

```sql
create table store_stores (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  name text not null,
  slug text,
  city text,
  state text,
  address text,
  default_delivery_region text,
  status text not null default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `store_channels`

```sql
create table store_channels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  provider text not null default 'evolution',
  evolution_instance_name text not null unique,
  phone_number text,
  webhook_url text,
  purpose text default 'sales'
    check (purpose in ('sales','support','campaigns','internal_product_capture')),
  connection_status text default 'disconnected',
  status text not null default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## 6. Catálogo de produtos

Produtos são o centro do MVP.

### Requisitos

```text
- cadastro manual de produto
- edição de produto
- importação por planilha
- upload posterior de fotos
- vínculo de fotos por SKU/código/nome ou match manual
- geração de descrição enriquecida
- geração de conteúdo para RAG
- registro de origem dos dados
- status: draft, needs_review, active, archived
```

### `store_products`

```sql
create table store_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,

  external_id text,
  source_url text,
  source_type text default 'manual'
    check (source_type in ('manual','spreadsheet','url','whatsapp','api','scraping')),

  name text not null,
  normalized_name text,
  category text,
  subcategory text,
  brand text,
  model text,
  sku text,

  description_short text,
  description_long text,

  price_type text default 'unknown'
    check (price_type in ('fixed','on_request','from','unknown')),
  price_amount numeric(12,2),
  price_currency text default 'BRL',
  old_price_amount numeric(12,2),

  availability_status text default 'unknown'
    check (availability_status in ('available','unavailable','made_to_order','unknown')),
  stock_quantity integer,

  pickup_available boolean,
  delivery_available boolean,
  assembly_included boolean,
  delivery_region text,

  main_image_url text,

  status text not null default 'draft'
    check (status in ('draft','needs_review','active','archived')),
  confidence numeric(3,2),
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `store_product_attributes`

```sql
create table store_product_attributes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  product_id uuid not null references store_products(id) on delete cascade,
  attribute_name text not null,
  attribute_value text not null,
  unit text,
  source text default 'manual',
  confidence numeric(3,2),
  created_at timestamptz default now()
);
```

Exemplos de atributos:

```text
quantidade_portas = 6
cor = branco
voltagem = 110v
largura = 120 cm
altura = 180 cm
profundidade = 45 cm
material = MDF
capacidade = 375 litros
```

### `store_product_images`

```sql
create table store_product_images (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  product_id uuid not null references store_products(id) on delete cascade,
  storage_path text,
  public_url text,
  original_filename text,
  alt_text text,
  is_main boolean default false,
  position integer default 0,
  source text default 'manual',
  status text default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

---

## 7. Importação de planilha e fotos

### Tela de importação

Criar:

```text
/produtos/importar
```

Fluxo:

```text
1. Upload CSV/XLSX
2. Preview das primeiras linhas
3. Mapeamento de colunas
4. Validação
5. Confirmação
6. Criação/atualização dos produtos
7. Logs de erro
8. Upload posterior de fotos
```

### Dependências recomendadas

```bash
npm install xlsx papaparse
npm install -D @types/papaparse
```

### `store_product_import_jobs`

```sql
create table store_product_import_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  file_url text,
  file_name text,
  file_type text,
  status text not null default 'uploaded'
    check (status in ('uploaded','mapped','processing','completed','failed','cancelled')),
  total_rows integer default 0,
  success_rows integer default 0,
  error_rows integer default 0,
  column_mapping jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  finished_at timestamptz
);
```

### `store_product_import_rows`

```sql
create table store_product_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references store_product_import_jobs(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null,
  normalized_data jsonb,
  status text not null default 'pending'
    check (status in ('pending','valid','invalid','imported','failed')),
  error_message text,
  product_id uuid references store_products(id) on delete set null,
  created_at timestamptz default now()
);
```

### Upload de fotos em lote

Criar:

```text
/produtos/fotos
```

Fluxo:

```text
1. Upload múltiplo de imagens
2. Match automático por SKU/nome/código no filename
3. Lista de arquivos não vinculados
4. Match manual
5. Criação de store_product_images
```

### `store_product_media_batches`

```sql
create table store_product_media_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  status text default 'processing',
  total_files integer default 0,
  matched_files integer default 0,
  unmatched_files integer default 0,
  created_at timestamptz default now(),
  finished_at timestamptz
);
```

### `store_product_media_batch_files`

```sql
create table store_product_media_batch_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references store_product_media_batches(id) on delete cascade,
  file_name text not null,
  storage_path text,
  match_strategy text,
  matched_product_id uuid references store_products(id) on delete set null,
  status text default 'pending'
    check (status in ('pending','matched','unmatched','confirmed','failed')),
  error_message text,
  created_at timestamptz default now()
);
```

---

## 8. Conversas e mensagens

Para preservar isolamento do Chat Sales original, o MVP deve usar tabelas próprias:

```text
store_contacts
store_conversations
store_messages
```

### `store_contacts`

```sql
create table store_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  name text,
  phone_number text not null,
  remote_jid text,
  email text,
  city text,
  state text,
  tags text[] default '{}',
  custom_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(account_id, phone_number)
);
```

### `store_conversations`

```sql
create table store_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  channel_id uuid references store_channels(id) on delete set null,
  contact_id uuid not null references store_contacts(id) on delete cascade,

  operational_status text default 'bot_active'
    check (operational_status in ('bot_active','awaiting_human','in_service','resolved','paused')),
  commercial_stage text default 'new_lead'
    check (commercial_stage in (
      'new_lead',
      'product_discovery',
      'product_recommended',
      'price_requested',
      'quote_requested',
      'payment_link_sent',
      'negotiation',
      'won',
      'lost'
    )),

  assigned_user_id uuid references auth.users(id) on delete set null,
  summary text,
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  last_intent text,
  handoff_reason text,
  lost_reason text,
  won_at timestamptz,
  resolved_at timestamptz,

  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `store_messages`

```sql
create table store_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  conversation_id uuid not null references store_conversations(id) on delete cascade,
  contact_id uuid references store_contacts(id) on delete set null,

  evolution_message_id text,
  remote_jid text,
  from_who text not null check (from_who in ('lead','ai','human','system')),
  sender_type text,
  content text,
  content_type text default 'text',
  media_url text,
  media_mime_type text,
  raw_payload jsonb,
  ai_input_text text,

  whatsapp_status text,
  created_at timestamptz default now()
);
```

---

## 9. Inteligência comercial por contato/conversa

Objetivo: permitir campanhas e priorização com base em interesses reais.

### `store_conversation_products`

```sql
create table store_conversation_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  conversation_id uuid not null references store_conversations(id) on delete cascade,
  contact_id uuid not null references store_contacts(id) on delete cascade,
  product_id uuid references store_products(id) on delete set null,
  relation_type text not null
    check (relation_type in (
      'mentioned_by_customer',
      'recommended_by_agent',
      'sent_by_operator',
      'asked_price',
      'asked_delivery',
      'purchase_intent',
      'rejected'
    )),
  confidence numeric(3,2),
  source_message_id uuid references store_messages(id) on delete set null,
  created_at timestamptz default now()
);
```

### `store_contact_product_interests`

```sql
create table store_contact_product_interests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  contact_id uuid not null references store_contacts(id) on delete cascade,
  product_id uuid references store_products(id) on delete set null,
  category text,
  interest_score numeric(5,2) default 0,
  intent_level text default 'low'
    check (intent_level in ('low','medium','high','purchase_intent')),
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  source text,
  metadata jsonb default '{}'::jsonb
);
```

### `store_contact_profiles`

```sql
create table store_contact_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  contact_id uuid not null references store_contacts(id) on delete cascade,
  preferred_categories text[] default '{}',
  preferred_price_min numeric(12,2),
  preferred_price_max numeric(12,2),
  city text,
  delivery_region text,
  lifecycle_stage text default 'lead',
  last_interest_at timestamptz,
  last_purchase_at timestamptz,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(account_id, contact_id)
);
```

### `store_message_insights`

```sql
create table store_message_insights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  conversation_id uuid not null references store_conversations(id) on delete cascade,
  message_id uuid not null references store_messages(id) on delete cascade,
  intent text,
  entities jsonb default '{}'::jsonb,
  product_mentions jsonb default '[]'::jsonb,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  urgency text,
  sentiment text,
  confidence numeric(3,2),
  created_at timestamptz default now()
);
```

---

## 10. RAG de produtos

### Objetivo

Permitir que o agente responda perguntas do cliente usando catálogo estruturado.

Exemplos:

```text
"Tem roupeiro de 6 portas?"
"Qual geladeira vocês têm 110v?"
"Tem sofá retrátil?"
"Entrega em Leopoldina?"
"Esse armário tem montagem?"
```

### Tabelas

#### `store_product_documents`

```sql
create table store_product_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  product_id uuid not null references store_products(id) on delete cascade,
  source_type text default 'product_generated',
  title text,
  raw_text text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

#### `store_product_chunks`

```sql
create table store_product_chunks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  product_id uuid not null references store_products(id) on delete cascade,
  document_id uuid not null references store_product_documents(id) on delete cascade,
  chunk_text text not null,
  chunk_index integer not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

#### `store_product_embeddings`

```sql
create extension if not exists vector;

create table store_product_embeddings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  product_id uuid not null references store_products(id) on delete cascade,
  chunk_id uuid not null references store_product_chunks(id) on delete cascade,
  embedding vector(1536) not null,
  model text default 'text-embedding-3-small',
  created_at timestamptz default now()
);
```

#### `store_rag_query_logs`

```sql
create table store_rag_query_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  conversation_id uuid references store_conversations(id) on delete set null,
  message_id uuid references store_messages(id) on delete set null,
  query_text text not null,
  matched_product_ids uuid[] default '{}',
  top_chunks jsonb default '[]'::jsonb,
  score_summary jsonb default '{}'::jsonb,
  answer_confidence numeric(3,2),
  created_at timestamptz default now()
);
```

### Helpers necessários

Criar:

```text
src/lib/store/rag.ts
```

Funções:

```ts
generateEmbedding(text: string): Promise<number[]>

ingestProductDocument(params: {
  accountId: string
  storeId?: string
  productId: string
  rawText: string
}): Promise<void>

queryProductChunks(params: {
  accountId: string
  storeId?: string
  queryText: string
  topK?: number
}): Promise<Array<{
  productId: string
  chunkText: string
  score: number
}>>
```

---

## 11. Agente conversacional de loja

Criar:

```text
src/lib/store/pipeline.ts
src/lib/store/agent.ts
src/lib/store/dispatcher.ts
src/lib/store/insights.ts
src/app/api/webhooks/evolution/route.ts
```

### Fluxo

```text
Evolution webhook
→ normalizar payload
→ resolver store_channel por instanceName
→ criar/atualizar store_contact
→ criar/atualizar store_conversation
→ salvar store_message
→ extrair intenção/entities
→ consultar RAG
→ rodar agente
→ responder via Evolution
→ atualizar produtos de interesse
→ atualizar pipeline
→ handoff se necessário
```

### Output estruturado do agente

```json
{
  "reply": "string",
  "classification": {
    "intent": "buscar_produto | pedir_preco | perguntar_entrega | compra | suporte | humano | outro",
    "commercial_stage": "new_lead | product_discovery | product_recommended | price_requested | quote_requested | payment_link_sent | negotiation | won | lost",
    "confidence": 0.85
  },
  "products": [
    {
      "product_id": "uuid",
      "relation_type": "mentioned_by_customer | recommended_by_agent | asked_price | purchase_intent",
      "confidence": 0.9
    }
  ],
  "contact_insights": {
    "preferred_categories": ["roupeiro"],
    "budget_min": null,
    "budget_max": 1500,
    "delivery_region": "Leopoldina",
    "intent_level": "high"
  },
  "handoff": {
    "needs_human": false,
    "reason": null
  },
  "actions": {
    "create_order": false,
    "send_payment_link": false,
    "save_product_interest": true
  },
  "debug": {
    "rag_used": true,
    "notes": "string"
  }
}
```

### Regras de handoff

Handoff para humano quando:

```text
- produto tem price_type = on_request
- cliente pede negociação/desconto
- baixa confiança no RAG
- pergunta fora do catálogo
- cliente pede vendedor/humano
- intenção de compra com preço não definido
- reclamação/problema
```

---

## 12. Desk / Inbox

Criar:

```text
/inbox
```

Elementos:

```text
Lista de conversas:
- nome/telefone
- último texto
- status operacional
- etapa comercial
- produto de interesse
- intenção
- vendedor responsável
- tempo sem resposta

Chat:
- histórico
- resumo IA
- produtos mencionados
- produtos recomendados
- botão assumir atendimento
- botão voltar para bot
- notas internas
- enviar produto
- enviar link de pagamento no futuro
```

Filtros:

```text
- status operacional
- etapa comercial
- produto
- categoria
- intenção alta
- sem resposta
- vendedor
- campanha de origem
```

---

## 13. Pipeline comercial

Separar status operacional de etapa comercial.

### Status operacional

```text
bot_active
awaiting_human
in_service
resolved
paused
```

### Etapa comercial

```text
new_lead
product_discovery
product_recommended
price_requested
quote_requested
payment_link_sent
negotiation
won
lost
```

### Histórico

```sql
create table store_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  conversation_id uuid not null references store_conversations(id) on delete cascade,
  from_stage text,
  to_stage text,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

---

## 14. Pagamentos

### Fase 1 — configurações

Criar tela:

```text
/configuracoes/pagamentos
```

Permitir configurar:

```text
- provedor
- Pix ativo
- cartão ativo
- boleto ativo
- webhook URL
- status da integração
- testar conexão
```

### `store_payment_integrations`

```sql
create table store_payment_integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  provider text not null,
  status text default 'inactive',
  public_key text,
  secret_ref text,
  webhook_secret_ref text,
  pix_enabled boolean default true,
  credit_card_enabled boolean default false,
  boleto_enabled boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Fase 2 — pedidos e pagamentos

```sql
create table store_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  contact_id uuid not null references store_contacts(id) on delete cascade,
  conversation_id uuid references store_conversations(id) on delete set null,
  status text not null default 'pending',
  total_amount numeric(12,2) not null default 0,
  payment_method text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

```sql
create table store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references store_orders(id) on delete cascade,
  product_id uuid not null references store_products(id) on delete cascade,
  quantity integer not null default 1,
  price_amount numeric(12,2) not null,
  created_at timestamptz default now()
);
```

```sql
create table store_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  order_id uuid not null references store_orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  payment_url text,
  status text default 'pending',
  amount numeric(12,2) not null,
  paid_at timestamptz,
  created_at timestamptz default now()
);
```

---

## 15. Campanhas promocionais

### Objetivo

Permitir campanhas com segmentação baseada em:

```text
- produto de interesse
- categoria de interesse
- intenção de compra
- faixa de preço
- região
- status do funil
- tempo desde último contato
- produto indisponível que voltou ao estoque
```

### Telas

```text
/campanhas
/campanhas/nova
/campanhas/[id]
/segmentos
```

### `store_segments`

```sql
create table store_segments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  name text not null,
  description text,
  rules jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `store_campaigns`

```sql
create table store_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references store_accounts(id) on delete cascade,
  store_id uuid references store_stores(id) on delete set null,
  name text not null,
  objective text,
  channel text default 'whatsapp',
  status text default 'draft',
  message_template text not null,
  segment_rules jsonb default '{}'::jsonb,
  scheduled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `store_campaign_audiences`

```sql
create table store_campaign_audiences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references store_campaigns(id) on delete cascade,
  contact_id uuid not null references store_contacts(id) on delete cascade,
  reason text,
  matched_rules jsonb default '{}'::jsonb,
  status text default 'pending',
  created_at timestamptz default now()
);
```

### `store_campaign_messages`

```sql
create table store_campaign_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references store_campaigns(id) on delete cascade,
  contact_id uuid not null references store_contacts(id) on delete cascade,
  conversation_id uuid references store_conversations(id) on delete set null,
  message_text text not null,
  status text default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now()
);
```

---

## 16. RLS, índices e segurança

Todas as tabelas `store_*` devem ter RLS.

Princípios:

```text
system_admin vê tudo
client_admin vê a própria conta
client_manager vê a própria conta/loja
seller vê conversas e recursos aos quais tem acesso
viewer só leitura
```

Funções auxiliares recomendadas:

```sql
auth.store_user_role()
auth.store_account_ids()
auth.store_has_account_access(account_id uuid)
auth.store_has_store_access(store_id uuid)
```

Índices mínimos:

```sql
create index idx_store_products_account_store on store_products(account_id, store_id);
create index idx_store_products_category on store_products(account_id, category);
create index idx_store_contacts_account_phone on store_contacts(account_id, phone_number);
create index idx_store_conversations_account_status on store_conversations(account_id, operational_status, commercial_stage);
create index idx_store_messages_conversation_created on store_messages(conversation_id, created_at desc);
create index idx_store_interests_contact on store_contact_product_interests(account_id, contact_id);
create index idx_store_campaigns_account_status on store_campaigns(account_id, status);
```

---

## 17. Rotas recomendadas

### API

```text
POST /api/webhooks/evolution
GET  /api/inbox/conversations
GET  /api/inbox/conversations/[id]
POST /api/inbox/conversations/[id]/messages
POST /api/inbox/conversations/[id]/assign
POST /api/inbox/conversations/[id]/resolve

GET  /api/products
POST /api/products
GET  /api/products/[id]
PATCH /api/products/[id]
POST /api/products/import
POST /api/products/images/batch
POST /api/products/[id]/rag/reindex

GET  /api/campaigns
POST /api/campaigns
POST /api/campaigns/[id]/preview
POST /api/campaigns/[id]/schedule

GET  /api/settings/payments
POST /api/settings/payments
POST /api/webhooks/payments
```

### Frontend

```text
/
/inbox
/pipeline
/produtos
/produtos/importar
/produtos/fotos
/produtos/[id]
/campanhas
/campanhas/nova
/segmentos
/pagamentos
/equipe
/configuracoes
```

---

## 18. Roadmap por fases

### Fase 0 — Auditoria e limpeza

- Renomear projeto para `store-sales-mvp`
- Atualizar README
- Atualizar metadata
- Remover/ocultar referências a saúde, agenda, Google Calendar e Chatwoot
- Validar deploy no EasyPanel
- Garantir que app roda separado do `panel/adminpanel`

### Fase 1 — Base multi-tenant e usuários

- Criar `store_accounts`
- Criar `store_user_profiles`
- Criar `store_account_memberships`
- Criar `store_user_store_access`
- Criar `store_stores`
- Criar `store_channels`
- Criar layout/menu do produto Store Sales
- Criar telas de equipe e permissões

### Fase 2 — Catálogo

- Criar `store_products`
- Criar `store_product_attributes`
- Criar `store_product_images`
- CRUD de produtos
- Upload de imagem individual
- Status draft/active/archived
- Geração de descrição base

### Fase 3 — Importação

- Upload CSV/XLSX
- Preview
- Mapeamento de colunas
- Validação
- `store_product_import_jobs`
- `store_product_import_rows`
- Upload de fotos em lote
- Match por SKU/nome
- Revisão de arquivos não vinculados

### Fase 4 — Conversas/Desk

- Criar `store_contacts`
- Criar `store_conversations`
- Criar `store_messages`
- Criar webhook Evolution próprio
- Criar inbox de loja
- Criar envio de mensagens
- Criar assumir/pausar/resolver atendimento

### Fase 5 — Inteligência comercial

- Criar `store_conversation_products`
- Criar `store_contact_product_interests`
- Criar `store_contact_profiles`
- Criar `store_message_insights`
- Extrair intenção/entities de mensagens
- Exibir produtos de interesse no desk

### Fase 6 — RAG

- Criar product documents/chunks/embeddings
- Ingestão RAG por produto
- Reindexação manual
- Busca semântica
- Logs de RAG
- Store Agent com output estruturado
- Handoff por baixa confiança/preço sob consulta

### Fase 7 — Pipeline comercial

- Kanban de conversas
- Histórico de mudança de etapa
- Filtros por produto/categoria/intenção
- Relatórios de conversão

### Fase 8 — Pagamentos

- Tela de integração
- `store_payment_integrations`
- `store_orders`
- `store_order_items`
- `store_payments`
- Geração de link de pagamento
- Webhook de confirmação

### Fase 9 — Campanhas

- Segmentos
- Campanhas
- Preview de audiência
- Disparo controlado
- Métricas de campanha
- Segmentação por produto/categoria/intenção

---

## 19. Critérios de aceite

### Isolamento

- Nenhuma rota do `panel/adminpanel` é alterada
- Nenhuma tabela não-store é alterada sem justificativa formal
- Webhook da loja aponta para `store-sales-mvp`
- Mensagens da loja não entram no Chat Sales original

### Produto

- Produto pode ser criado manualmente
- Produto pode ser importado via planilha
- Fotos podem ser vinculadas ao produto
- Produto gera conteúdo para RAG
- Produto pode ficar em draft/active/archived

### Atendimento

- WhatsApp recebe mensagem
- Sistema cria contato/conversa/mensagem store
- IA responde usando catálogo
- Handoff funciona
- Operador vê histórico e produtos de interesse

### Campanhas

- Contatos podem ser segmentados por interesse
- Campanha pode ser criada como draft
- Audiência pode ser pré-visualizada
- Disparo deve ter trava/limite

### Pagamentos

- Integração pode ser configurada
- Pedido pode ser criado manualmente ou por conversa
- Link de pagamento pode ser associado ao pedido
- Webhook atualiza status

---

## 20. Prompt mestre para o agente/dev

```text
Você é um agente de desenvolvimento sênior trabalhando no repositório fabiohhsales/store-sales-mvp.

Objetivo:
Transformar o projeto em um MVP separado do Chat Sales original, voltado para lojas de móveis e eletrodomésticos, com WhatsApp conversacional, desk humano, catálogo de produtos, RAG, campanhas e pagamentos.

Regras absolutas:
1. Não alterar o projeto panel/adminpanel.
2. Não impactar o Chat Sales original em produção.
3. Não depender de Chatwoot.
4. Não manter lógica clínica/agendamento/Google Calendar no fluxo principal.
5. Criar tabelas próprias com prefixo store_.
6. Garantir isolamento por account_id/store_id/channel_id.
7. Toda tabela store_* deve ter RLS e índices.
8. Criar migrations aditivas e reversíveis sempre que possível.
9. Manter o app deployável no EasyPanel como serviço independente.
10. Priorizar MVP funcional antes de sofisticação visual.

Sequência de execução:
1. Limpar identidade do projeto: README, package name, metadata e menus.
2. Criar schema store_* base: accounts, users, memberships, stores, channels.
3. Criar produtos: products, attributes, images.
4. Criar importação de planilha e fotos.
5. Criar conversas próprias: contacts, conversations, messages.
6. Criar webhook Evolution próprio do app.
7. Criar inteligência comercial: product interests, message insights, conversation products.
8. Criar RAG: documents, chunks, embeddings, query logs.
9. Criar agente store com output estruturado.
10. Criar tela de pagamentos e estrutura inicial.
11. Criar campanhas e segmentos.

Ao implementar:
- Faça commits pequenos por fase.
- Adicione testes quando possível.
- Documente decisões técnicas.
- Não remova código herdado sem garantir que não é usado; prefira esconder/neutralizar.
- Se houver risco de impactar o sistema original, pare e registre a dúvida.
```

---

## 21. Observações finais

O erro a evitar:

```text
copiar o Chat Sales inteiro e trocar os textos para loja
```

O caminho correto:

```text
usar o que presta da base atual
+
criar domínio próprio de loja/produtos/RAG/campanhas
+
isolar completamente do sistema ON
```

Prioridade de validação comercial:

```text
Cliente pergunta no WhatsApp
→ IA entende necessidade
→ consulta produtos
→ recomenda corretamente
→ coleta interesse
→ chama vendedor quando necessário
→ registra dado para campanha futura
```

Se isso funcionar bem, o produto tem caminho.
