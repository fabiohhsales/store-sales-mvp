# Store Sales MVP — Chat Sales

Plataforma conversacional e e-commerce verticalizada para lojas de móveis e eletrodomésticos, integrada ao WhatsApp. Permite importar catálogos, atender clientes via Desk humano, responder dúvidas automaticamente com inteligência artificial usando RAG (Busca Semântica) e gerar links de checkout Pix/Cartão.

---

## 🏗️ Arquitetura do Sistema

```text
Cliente (WhatsApp)
  │
Evolution API (WhatsApp) ─── Webhook ──→ store-sales-mvp (Next.js Node Webhook)
  │                                           │
  ↕ Integração Humana                         ├──→ Ingestão / Consulta RAG (OpenAI Vector)
Chatwoot (Atendimento)                        ├──→ Catalogação e Produtos (Supabase storage)
                                              └──→ Checkouts & Pedidos (Stripe/AbacatePay)
```

**Principais Recursos:**
- **Catálogo de Produtos**: CRUD completo de móveis e eletrodomésticos com especificações estruturadas (dimensões, materiais, cores).
- **RAG (Busca Semântica)**: Indexação automática de especificações em embeddings da OpenAI para respostas precisas do bot via WhatsApp.
- **Importação CSV**: Importador em lote com delimitadores dinâmicos executado diretamente no navegador com logs e controle de progresso.
- **Upload de Imagens**: Seletor integrado com API própria enviando imagens diretamente para um bucket público do Supabase Storage.
- **Visualização de Kanban**: Pipeline de vendas estruturado com etapas comerciais configuráveis (`new_lead` a `won`).

---

## 🛠️ Stack Tecnológica

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **Estilização**: Tailwind CSS 4 + shadcn/ui
- **Banco de Dados**: Supabase (PostgreSQL + RLS + Storage)
- **Mensageria**: Evolution API (WhatsApp)
- **Integração de Pagamento**: Stripe / AbacatePay

---

## 🚀 Setup Local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie e configure o arquivo `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

3. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acesse a aplicação em [http://localhost:3000](http://localhost:3000).
