# Handoff técnico — MVP Loja no Chat Sales

## Prompt para Agente de Criação / Dev

Você é um agente de criação técnica/dev responsável por desenhar e implementar um MVP de atendimento conversacional para uma loja de móveis e eletrodomésticos dentro do ecossistema existente do Chat Sales.

O objetivo é criar um módulo isolado de loja/catálogo/produtos/RAG/WhatsApp conversacional, reaproveitando apenas o core seguro do Chat Sales, sem impactar o funcionamento atual do produto original, seus usuários, clientes, fluxos, agenda, follow-ups ou dados existentes.

Este documento deve ser tratado como briefing técnico, regra de segurança e checklist de implementação.

---

## 1. Objetivo do MVP

Criar um módulo experimental para loja de móveis e eletrodomésticos com:

- WhatsApp conversacional conectado a um número específico da loja.
- Desk/inbox no mesmo estilo do Chat Sales.
- Base de produtos estruturada.
- RAG para entender produtos, atributos, disponibilidade, entrega e condições comerciais.
- Handoff para humano quando necessário.
- Página(s) novas no front do Chat Sales, sem interferir nas páginas atuais.
- Usuários específicos e permissões isoladas.
- Tabelas dedicadas para loja/produtos/RAG.
- Reaproveitamento controlado de `accounts`, `users`, `contacts`, `conversations`, `messages` e `channels`, quando seguro.

O MVP **não deve incluir agenda**, fluxo clínico, cadências médicas ou qualquer dependência de regras específicas do Chat Sales original.

---

## 2. Regra central de arquitetura

O módulo deve ser construído como extensão isolada:

```txt
Chat Sales original
├── Fluxos atuais
├── Usuários atuais
├── Clientes atuais
├── Agenda / follow-up / atendimento atual
└── Novo módulo isolado: Store Sales / Loja
    ├── WhatsApp específico
    ├── Desk específico
    ├── Produtos
    ├── RAG de produtos
    └── Configuração de agente por loja
```

A implementação deve seguir o princípio:

> Reaproveitar o core conversacional, mas isolar todo domínio de produto, RAG, loja e configuração do agente.

---

## 3. Restrições obrigatórias: não impactar o Chat Sales original

### 3.1. Proibido

Não fazer:

- Alterações destrutivas em tabelas existentes.
- Renomear colunas existentes.
- Remover colunas existentes.
- Alterar significado de campos existentes.
- Alterar políticas RLS existentes sem análise e rollback.
- Misturar dados de loja com dados clínicos/de atendimento atual.
- Reaproveitar tabelas específicas de agenda, pacientes ou cadência clínica.
- Rodar migrations sem backup.
- Adicionar lógica de loja em workflows atuais de agenda/follow-up.
- Enviar produto/catálogo inteiro para prompt de IA.
- Gerar embedding a cada mensagem recebida.
- Usar tabelas novas sem `account_id` e, quando aplicável, `store_id`.

### 3.2. Permitido com cuidado

Pode fazer, desde que seja aditivo e versionado:

- Criar novas tabelas.
- Criar novos índices.
- Criar novas policies RLS para tabelas novas.
- Adicionar colunas opcionais e não obrigatórias em tabelas existentes, se realmente necessário.
- Criar views específicas para o módulo loja.
- Criar rotas novas no front.
- Criar workflows novos no n8n.
- Criar buckets específicos de storage.

### 3.3. Estratégia de segurança

Toda implementação deve ter:

- Migração versionada.
- Rollback planejado.
- Teste em conta/canal sandbox.
- Feature flag do módulo loja.
- Logs separados por módulo.
- Filtros obrigatórios por `account_id`, `store_id` e `channel_id`.

---

## 4. Tabelas existentes que podem ser reaproveitadas

Antes de criar qualquer coisa, auditar as tabelas existentes e confirmar nomes reais, colunas e relações.

### 4.1. Reaproveitar, se forem genéricas

| Tabela existente | Uso no MVP loja | Condição |
|---|---|---|
| `accounts` | Cliente/empresa/tenant | Reaproveitar se representa a organização cliente |
| `users` / `profiles` | Usuários internos | Reaproveitar se representa usuários do sistema |
| `account_users` / memberships | Permissões por conta | Reaproveitar ou complementar |
| `contacts` | Clientes finais/leads do WhatsApp | Reaproveitar |
| `conversations` | Conversas do desk | Reaproveitar com escopo por canal/módulo |
| `messages` | Histórico de mensagens | Reaproveitar |
| `channels` / `inboxes` | Número WhatsApp conectado | Reaproveitar se já existe essa abstração |
| `conversation_notes` | Notas internas | Reaproveitar se genérica |
| `tags` / `conversation_tags` | Marcadores | Reaproveitar se genérico |
| `logs` / `events` | Auditoria | Reaproveitar se genérico |

### 4.2. Não reaproveitar para este MVP

Evitar tabelas específicas como:

- `appointments`
- `patients`
- `medical_records`
- `clinical_departments`
- `agenda_slots`
- `appointment_followups`
- `lead_cadence` específica do fluxo atual
- `atendimento_cadence` específica do fluxo atual
- `agendado_cadence` específica do fluxo atual

Se houver necessidade de follow-up de loja no futuro, criar lógica própria, sem acoplar no MVP inicial.

---

## 5. Estratégia de isolamento

### 5.1. Escopo obrigatório

Todas as tabelas novas devem conter, no mínimo:

```sql
account_id uuid not null
created_at timestamptz default now()
updated_at timestamptz default now()
```

Quando aplicável, também:

```sql
store_id uuid
channel_id uuid
created_by uuid
updated_by uuid
```

### 5.2. Módulo

Identificar claramente que a conversa pertence ao módulo de loja.

Opções:

1. Usar coluna `module` em `conversations` ou `channels`, se já existir.
2. Criar tabela relacional `conversation_modules`.
3. Usar `channel_id` como fonte da verdade: se o canal é do módulo loja, toda conversa daquele canal é loja.

Preferência para MVP:

```txt
channel_id específico da loja
+ store_agent_settings.channel_id
+ conversation_products para vincular produtos
```

Evitar mexer em `conversations` se não for necessário.

### 5.3. Schema/prefixo

Preferência técnica:

- Se o projeto suportar múltiplos schemas expostos com segurança: criar schema `store_sales`.
- Se for mais simples no Supabase atual: criar tabelas no `public` com prefixo `store_` ou `product_`.

Sugestão pragmática para MVP:

```txt
public.stores
public.store_agent_settings
public.products
public.product_attributes
public.product_images
public.product_documents
public.product_chunks
public.product_embeddings
public.conversation_products
public.product_capture_sessions
```

---

## 6. Tabelas novas dedicadas

### 6.1. `stores`

Representa uma loja/unidade dentro de uma conta.

```sql
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null,
  slug text,
  city text,
  state text,
  default_delivery_region text,
  status text not null default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Uso no MVP:

- Rede Minas Leopoldina como uma loja ou unidade.
- Permitir expansão futura para múltiplas lojas.

---

### 6.2. `store_agent_settings`

Configura o agente da loja por canal/número.

```sql
create table if not exists store_agent_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  channel_id uuid not null,
  agent_name text default 'Assistente da Loja',
  tone_of_voice text default 'consultivo, objetivo e cordial',
  auto_reply_enabled boolean default true,
  rag_enabled boolean default true,
  human_handoff_enabled boolean default true,
  fallback_message text,
  handoff_rules jsonb default '{}'::jsonb,
  business_rules jsonb default '{}'::jsonb,
  prompt_config jsonb default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Exemplos de regras:

```json
{
  "handoff_when": [
    "customer_asks_for_discount",
    "customer_wants_to_buy",
    "product_price_on_request",
    "low_confidence_answer",
    "angry_customer"
  ],
  "max_bot_messages_before_handoff": 6
}
```

---

### 6.3. `products`

Tabela principal de produtos.

Deve suportar produtos como o teste anterior:

- Roupeiro Joinville 6 portas.
- Preço: a combinar.
- Retirada na loja.
- Entrega e montagem grátis em Leopoldina e região.
- Categoria: Móveis > Quarto > Roupeiro.
- Atributos: quantidade de portas, modelo, tipo, cor, medidas, material etc.

```sql
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  external_id text,
  source_url text,
  source_type text default 'manual',
  name text not null,
  normalized_name text,
  category text,
  subcategory text,
  brand text,
  model text,
  sku text,
  description_short text,
  description_long text,
  price_type text default 'unknown',
  price_amount numeric(12,2),
  price_currency text default 'BRL',
  old_price_amount numeric(12,2),
  availability_status text default 'unknown',
  stock_quantity integer,
  pickup_available boolean,
  delivery_available boolean,
  assembly_included boolean,
  delivery_region text,
  main_image_url text,
  status text not null default 'draft',
  confidence numeric(3,2),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Valores recomendados:

```txt
price_type:
- fixed
- on_request
- from_price
- unknown

availability_status:
- available
- unavailable
- made_to_order
- unknown

status:
- draft
- active
- inactive
- archived
- needs_review
```

Exemplo de registro normalizado:

```json
{
  "name": "Roupeiro Joinville 6 portas",
  "normalized_name": "Roupeiro Joinville 6 portas",
  "category": "Móveis > Quarto > Roupeiro",
  "model": "Joinville",
  "price_type": "on_request",
  "price_amount": null,
  "price_currency": "BRL",
  "availability_status": "unknown",
  "pickup_available": true,
  "delivery_available": true,
  "assembly_included": true,
  "delivery_region": "Leopoldina e região",
  "source_url": "https://redeminasleopoldina.rdi.store/products/b44d3a2c-59ce-4c38-aade-de9eb216e2e8/Roupeiro-Joinville-6-portas"
}
```

---

### 6.4. `product_attributes`

Atributos flexíveis por produto.

Não criar colunas específicas para tudo dentro de `products`. Móveis e eletrodomésticos têm atributos muito diferentes.

```sql
create table if not exists product_attributes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  value text not null,
  unit text,
  value_type text default 'text',
  confidence numeric(3,2),
  source text default 'manual',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Exemplos:

```json
[
  {
    "name": "quantidade_portas",
    "value": "6",
    "unit": null,
    "source": "product_name"
  },
  {
    "name": "modelo",
    "value": "Joinville",
    "unit": null,
    "source": "product_name"
  },
  {
    "name": "tipo",
    "value": "Roupeiro",
    "unit": null,
    "source": "product_name"
  },
  {
    "name": "voltagem",
    "value": "110",
    "unit": "V",
    "source": "manual"
  }
]
```

---

### 6.5. `product_category_rules`

Define campos esperados por categoria. Ajuda o agente a perguntar o que falta.

```sql
create table if not exists product_category_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  category text not null,
  required_attributes jsonb default '[]'::jsonb,
  optional_attributes jsonb default '[]'::jsonb,
  examples jsonb default '[]'::jsonb,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Exemplo para roupeiro:

```json
{
  "category": "Móveis > Quarto > Roupeiro",
  "required_attributes": [
    "quantidade_portas",
    "cor",
    "altura",
    "largura",
    "profundidade"
  ],
  "optional_attributes": [
    "material",
    "quantidade_gavetas",
    "espelho",
    "tipo_de_abertura",
    "montagem_inclusa"
  ]
}
```

Exemplo para eletrodoméstico:

```json
{
  "category": "Eletrodomésticos",
  "required_attributes": [
    "marca",
    "modelo",
    "voltagem",
    "garantia"
  ],
  "optional_attributes": [
    "capacidade",
    "consumo",
    "selo_procel",
    "dimensoes"
  ]
}
```

---

### 6.6. `product_images`

Imagens dos produtos.

```sql
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  product_id uuid not null references products(id) on delete cascade,
  image_url text,
  storage_path text,
  alt_text text,
  is_main boolean default false,
  position integer default 0,
  source text default 'manual',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

Storage recomendado:

```txt
Bucket: store-product-media
Path: {account_id}/{store_id}/{product_id}/{filename}
```

---

### 6.7. `product_sources`

Rastreia de onde veio o produto ou informação.

```sql
create table if not exists product_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  product_id uuid references products(id) on delete cascade,
  source_type text not null,
  source_url text,
  source_name text,
  raw_payload jsonb default '{}'::jsonb,
  extraction_status text default 'pending',
  extracted_at timestamptz,
  created_at timestamptz default now()
);
```

Valores de `source_type`:

```txt
manual
website_url
spreadsheet
whatsapp_message
pdf_catalog
api
scraper
```

---

### 6.8. `product_documents`

Texto bruto ou semiestruturado usado para RAG.

```sql
create table if not exists product_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  product_id uuid references products(id) on delete cascade,
  source_id uuid references product_sources(id) on delete set null,
  title text,
  source_type text,
  source_url text,
  raw_text text,
  normalized_text text,
  metadata jsonb default '{}'::jsonb,
  status text default 'ready',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Exemplo de documento normalizado:

```txt
Produto: Roupeiro Joinville 6 portas.
Categoria: Móveis > Quarto > Roupeiro.
Condição comercial: preço a combinar.
Entrega: retirada na loja disponível. Entrega e montagem grátis em Leopoldina e região.
Atributos conhecidos: 6 portas, modelo Joinville.
```

---

### 6.9. `product_chunks`

Chunks do documento para busca semântica.

```sql
create table if not exists product_chunks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  product_id uuid references products(id) on delete cascade,
  document_id uuid references product_documents(id) on delete cascade,
  chunk_text text not null,
  chunk_index integer not null,
  token_count integer,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

---

### 6.10. `product_embeddings`

Embeddings dos chunks.

A dimensão do vetor deve ser ajustada ao modelo de embedding usado.

```sql
create table if not exists product_embeddings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  product_id uuid references products(id) on delete cascade,
  chunk_id uuid not null references product_chunks(id) on delete cascade,
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz default now()
);
```

Observações:

- Confirmar se `pgvector` está habilitado.
- Não gerar embedding por mensagem do cliente.
- Gerar embedding apenas quando produto/documento/chunk mudar.
- Usar busca top_k pequeno, preferencialmente 5 a 10.
- Sempre filtrar por `account_id` e `store_id` antes ou durante a busca vetorial.

---

### 6.11. `conversation_products`

Liga conversas a produtos mencionados, recomendados ou de interesse.

```sql
create table if not exists conversation_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  conversation_id uuid not null references conversations(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  relation_type text not null,
  confidence numeric(3,2),
  source text default 'agent',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

Valores de `relation_type`:

```txt
mentioned_by_customer
recommended_by_agent
sent_by_human
interested
rejected
purchased
needs_price_confirmation
```

Uso no desk:

- Mostrar produto de interesse no card da conversa.
- Ajudar humano a entender o contexto.
- Medir produtos mais perguntados.
- Medir conversão por produto/categoria.

---

### 6.12. `product_capture_sessions`

Controla cadastro/complementação de produto via WhatsApp ou painel.

```sql
create table if not exists product_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  conversation_id uuid references conversations(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  current_step text,
  status text default 'draft',
  extracted_json jsonb default '{}'::jsonb,
  missing_fields jsonb default '[]'::jsonb,
  last_user_message text,
  last_agent_message text,
  confidence numeric(3,2),
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Valores de `status`:

```txt
draft
incomplete
pending_confirmation
approved
saved
needs_human_review
rejected
```

---

### 6.13. `rag_query_logs`

Auditoria do uso do RAG.

```sql
create table if not exists rag_query_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  store_id uuid not null references stores(id),
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  query_text text not null,
  matched_chunk_ids jsonb default '[]'::jsonb,
  matched_product_ids jsonb default '[]'::jsonb,
  top_k integer,
  score_summary jsonb default '{}'::jsonb,
  answer_generated text,
  confidence numeric(3,2),
  fallback_used boolean default false,
  created_at timestamptz default now()
);
```

Uso:

- Auditar respostas ruins.
- Ver o que o cliente perguntou.
- Melhorar base de produtos.
- Identificar produtos sem dados suficientes.

---

## 7. Índices mínimos recomendados

Criar índices desde o início para evitar gargalos.

```sql
create index if not exists idx_stores_account on stores(account_id);

create index if not exists idx_products_account_store_status
on products(account_id, store_id, status);

create index if not exists idx_products_account_category
on products(account_id, category);

create index if not exists idx_product_attributes_product
on product_attributes(product_id);

create index if not exists idx_product_attributes_lookup
on product_attributes(account_id, store_id, name);

create index if not exists idx_product_images_product
on product_images(product_id);

create index if not exists idx_product_documents_product
on product_documents(product_id);

create index if not exists idx_product_chunks_lookup
on product_chunks(account_id, store_id, product_id);

create index if not exists idx_conversation_products_conversation
on conversation_products(conversation_id);

create index if not exists idx_conversation_products_product
on conversation_products(product_id);

create index if not exists idx_product_capture_sessions_conversation
on product_capture_sessions(conversation_id);

create index if not exists idx_rag_query_logs_conversation
on rag_query_logs(conversation_id, created_at desc);
```

Para `messages` e `conversations`, avaliar se já existem:

```sql
create index if not exists idx_messages_conversation_created
on messages(conversation_id, created_at desc);

create index if not exists idx_conversations_account_channel_status
on conversations(account_id, channel_id, status);
```

Atenção: só criar índices em tabelas existentes após auditar se já existem índices equivalentes.

---

## 8. RLS e permissões

### 8.1. Regra geral

Toda tabela nova deve ter RLS habilitado.

Exemplo base:

```sql
alter table products enable row level security;
```

Policy conceitual:

```txt
Usuário só pode ler/escrever produtos se estiver vinculado ao mesmo account_id.
```

Se existir tabela `account_users`, usar algo como:

```sql
create policy "Users can access products from their accounts"
on products
for select
using (
  exists (
    select 1
    from account_users au
    where au.account_id = products.account_id
      and au.user_id = auth.uid()
  )
);
```

Adaptar nomes reais das tabelas/colunas após auditoria.

### 8.2. Permissões por módulo

Se possível, criar permissão específica:

```txt
store_sales.admin
store_sales.manager
store_sales.agent
store_sales.viewer
```

Sugestão:

| Papel | Pode fazer |
|---|---|
| `store_sales.admin` | Configurar loja, agente, usuários, produtos e RAG |
| `store_sales.manager` | Gerenciar produtos, ver conversas e assumir atendimentos |
| `store_sales.agent` | Atender conversas e ver produtos |
| `store_sales.viewer` | Apenas visualizar |

---

## 9. Fluxos n8n / backend

Criar workflows separados dos fluxos originais do Chat Sales.

### 9.1. Workflow de mensagem recebida da loja

```txt
WhatsApp específico da loja
→ Webhook loja
→ Identificar channel_id
→ Buscar store_agent_settings
→ Validar account_id/store_id
→ Buscar ou criar contact
→ Buscar ou criar conversation
→ Salvar message
→ Classificar intenção
→ Buscar produtos via SQL/RAG
→ Gerar resposta
→ Salvar resposta
→ Enviar WhatsApp
→ Se necessário: handoff humano
```

### 9.2. Workflow de ingestão de produto

```txt
URL / planilha / cadastro manual / mensagem WhatsApp
→ Extrair dados
→ Normalizar produto
→ Upsert em products
→ Upsert em product_attributes
→ Salvar product_sources
→ Criar product_documents
→ Criar product_chunks
→ Gerar embeddings
→ Marcar produto como active ou needs_review
```

### 9.3. Workflow de RAG

```txt
Mensagem do cliente
→ Extrair intenção e entidades
→ Filtro SQL estruturado por account_id/store_id/category/attributes
→ Busca vetorial top_k
→ Montar contexto curto
→ Gerar resposta
→ Registrar rag_query_logs
```

### 9.4. Regras de handoff

Transferir para humano quando:

- Cliente pedir vendedor/humano.
- Cliente demonstrar intenção forte de compra.
- Produto tiver preço `on_request`.
- Resposta tiver baixa confiança.
- Cliente pedir desconto/negociação.
- Cliente reclamar.
- Cliente pedir prazo específico de entrega não sabido.
- O bot já respondeu muitas vezes sem resolver.

---

## 10. Interface/front

Criar páginas novas, protegidas por feature flag e permissão.

### 10.1. Rotas sugeridas

```txt
/store/inbox
/store/products
/store/products/:id
/store/knowledge
/store/settings
```

### 10.2. Não alterar páginas atuais

Não modificar comportamento de:

- Inbox atual do Chat Sales.
- Agenda.
- Follow-ups existentes.
- Cadências atuais.
- Configurações atuais de clínica/atendimento.

Se for necessário reaproveitar componentes, criar wrappers específicos:

```txt
StoreInboxPage
StoreProductListPage
StoreProductDetailPage
StoreKnowledgePage
StoreSettingsPage
```

### 10.3. Desk loja

Card da conversa deve mostrar:

- Nome do contato.
- Última mensagem.
- Status operacional.
- Responsável humano.
- Produtos mencionados/interessados.
- Confiança da IA.
- Indicação de handoff.

Detalhe da conversa deve mostrar:

- Histórico de mensagens.
- Produtos relacionados.
- Resumo da IA.
- Notas internas.
- Bot ligado/desligado naquela conversa.
- Botão “assumir atendimento”.
- Botão “devolver ao bot”, se aplicável.

---

## 11. Lógica do agente conversacional

### 11.1. Funções principais

O agente da loja deve:

1. Responder dúvidas sobre produtos.
2. Recomendar produtos com base na necessidade do cliente.
3. Coletar dados básicos do cliente.
4. Identificar produtos de interesse.
5. Acionar humano quando houver intenção forte.
6. Ajudar a completar cadastro de produto, se usado internamente.

### 11.2. Intenções mínimas

```txt
buscar_produto
comparar_produtos
perguntar_preco
perguntar_estoque
perguntar_entrega
perguntar_montagem
perguntar_forma_pagamento
pedir_humano
comprar_ou_reservar
cadastrar_produto
atualizar_produto
fora_do_escopo
```

### 11.3. Entidades mínimas

```txt
categoria
produto
marca
modelo
cor
medidas
voltagem
faixa_preco
cidade_bairro_entrega
quantidade
urgencia
```

### 11.4. Resposta segura

O agente deve seguir:

- Não inventar preço.
- Não inventar estoque.
- Não inventar prazo de entrega.
- Se preço for `on_request`, dizer que precisa confirmar com vendedor.
- Se a informação não estiver na base, dizer que vai verificar.
- Se a confiança for baixa, transferir ou sugerir confirmação.

---

## 12. Produto testado como referência

Usar como caso de teste inicial:

```json
{
  "source": {
    "store_name": "Rede Minas Leopoldina",
    "base_url": "https://redeminasleopoldina.rdi.store/",
    "source_type": "product_page"
  },
  "product": {
    "external_id": "b44d3a2c-59ce-4c38-aade-de9eb216e2e8",
    "source_url": "https://redeminasleopoldina.rdi.store/products/b44d3a2c-59ce-4c38-aade-de9eb216e2e8/Roupeiro-Joinville-6-portas",
    "name": "Roupeiro Joinville 6 portas",
    "category": "Móveis > Quarto > Roupeiro",
    "model": "Joinville",
    "price_type": "on_request",
    "price_amount": null,
    "price_currency": "BRL",
    "availability_status": "unknown",
    "pickup_available": true,
    "delivery_available": true,
    "assembly_included": true,
    "delivery_region": "Leopoldina e região"
  },
  "attributes": [
    {
      "name": "quantidade_portas",
      "value": "6"
    },
    {
      "name": "modelo",
      "value": "Joinville"
    },
    {
      "name": "tipo",
      "value": "Roupeiro"
    }
  ]
}
```

O MVP deve conseguir:

- Cadastrar esse produto.
- Criar atributos derivados.
- Criar documento de RAG.
- Criar chunks.
- Buscar o produto via pergunta em linguagem natural.
- Responder sem inventar preço.
- Acionar humano quando o cliente pedir mais informações ou preço.

Exemplos de perguntas:

```txt
Tem roupeiro de 6 portas?
Esse roupeiro entrega em Leopoldina?
Qual o preço do Roupeiro Joinville?
Tem guarda-roupa grande?
Vocês montam o móvel?
Me chama um vendedor.
```

Respostas esperadas:

```txt
Temos o Roupeiro Joinville 6 portas. Ele está cadastrado com retirada na loja e entrega/montagem grátis em Leopoldina e região. O preço está como “a combinar”, então posso chamar um vendedor para confirmar o valor com você.
```

---

## 13. Critérios de aceite

### 13.1. Banco

- Tabelas novas criadas sem quebrar tabelas existentes.
- Todas as tabelas novas com `account_id`.
- Tabelas de produto com `store_id`.
- RLS habilitado nas tabelas novas.
- Índices mínimos criados.
- Dados de teste inseridos em conta/canal sandbox.

### 13.2. Isolamento

- Usuário do Chat Sales original não vê módulo loja se não tiver permissão.
- Usuário da loja não vê dados de outros clientes.
- Conversas da loja não aparecem indevidamente no fluxo original, a menos que haja filtro explícito.
- Workflows de agenda/follow-up original não são acionados por mensagens da loja.
- Número WhatsApp da loja opera em canal separado.

### 13.3. Produto/RAG

- Produto de teste cadastrado.
- Atributos salvos corretamente.
- Documento/chunks/embeddings criados.
- Busca semântica encontra o produto por termos como “roupeiro”, “guarda-roupa”, “6 portas”.
- Agente não inventa preço quando `price_type = on_request`.
- Logs de RAG salvos.

### 13.4. Desk

- Conversa recebida aparece no inbox da loja.
- Humano consegue assumir atendimento.
- Produto de interesse aparece vinculado à conversa.
- Bot pode ser pausado por conversa.
- Handoff é registrado com motivo.

### 13.5. Não regressão

- Chat Sales original continua funcionando.
- Agenda original continua funcionando.
- Follow-ups originais continuam funcionando.
- Usuários atuais mantêm permissões.
- Não há alteração visual inesperada nas páginas atuais.

---

## 14. Plano de implementação sugerido

### Fase 0 — Auditoria

1. Listar tabelas existentes.
2. Mapear colunas de `accounts`, `users`, `contacts`, `conversations`, `messages`, `channels`.
3. Identificar RLS atual.
4. Identificar índices atuais.
5. Identificar workflows n8n atuais que não podem ser impactados.

SQL útil:

```sql
select 
  table_schema,
  table_name
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name;
```

```sql
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

### Fase 1 — Banco dedicado

1. Criar tabelas novas.
2. Criar índices.
3. Criar RLS.
4. Criar seed com loja teste.
5. Criar seed com produto Roupeiro Joinville.

### Fase 2 — Produto/RAG

1. Criar cadastro de produto básico.
2. Criar geração de documento normalizado.
3. Criar chunks.
4. Criar embeddings.
5. Criar função de busca por loja.
6. Criar logs de RAG.

### Fase 3 — WhatsApp/desk

1. Configurar canal WhatsApp específico.
2. Criar workflow novo de mensagem recebida da loja.
3. Criar roteamento por `channel_id`.
4. Criar inbox/página nova.
5. Criar handoff humano.

### Fase 4 — Teste controlado

1. Testar com número sandbox.
2. Testar perguntas reais.
3. Validar logs.
4. Validar isolamento.
5. Validar não regressão no Chat Sales original.

---

## 15. Checklist final para o dev/agente

Antes de concluir, responda objetivamente:

- Quais tabelas existentes foram reaproveitadas?
- Quais tabelas novas foram criadas?
- Alguma tabela existente foi alterada? Qual e por quê?
- Quais policies RLS foram criadas?
- Como o módulo loja está isolado por `account_id`, `store_id` e `channel_id`?
- Como garantir que usuários do Chat Sales original não serão impactados?
- Como garantir que workflows originais não serão acionados?
- Como o RAG busca apenas produtos da loja correta?
- Como o humano assume uma conversa?
- Como pausar o bot em uma conversa?
- Como auditar uma resposta gerada pela IA?
- Qual é o rollback?

---

## 16. Resumo executivo

Este MVP deve ser tratado como um vertical isolado de loja dentro do Chat Sales.

A lógica correta é:

```txt
Mesmo core conversacional
+ novo domínio de produtos
+ novo RAG
+ novo canal WhatsApp
+ novas permissões
+ novas páginas
+ zero impacto no Chat Sales original
```

A prioridade não é criar o sistema mais completo possível. A prioridade é provar que:

1. A loja consegue receber mensagens no WhatsApp.
2. O agente entende perguntas sobre produtos.
3. O RAG busca produtos corretamente.
4. O humano consegue assumir.
5. O Chat Sales original segue intacto.

Se isso funcionar, o próximo ciclo pode evoluir para estoque, ERP, recomendação avançada, campanhas e reengajamento.
