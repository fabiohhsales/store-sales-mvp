# Handoff de Continuidade - 2026-04-01

## Contexto e fonte de verdade

Antes de qualquer decisao, ler nesta ordem:

1. `CLAUDE.md`
2. `C:\Users\Pichau\Downloads\PLANwpp.md`
3. `C:\Users\Pichau\Downloads\PLANagenda.md`

`CLAUDE.md` e a fonte de verdade arquitetural do projeto. Os dois planos acima descrevem as frentes em execucao agora:

- Frente 1: estabilizacao WhatsApp/Evolution, QR, reconexao, webhook e monitoramento.
- Frente 2: rebuild do framework de Agenda com `appointments` como source of truth e Google como sync opcional.

## Regra principal de continuidade

Nao reiniciar nada do zero. Ja existe implementacao parcial relevante nas duas frentes. Continue em cima do que ja esta alterado no workspace e nao reverta mudancas existentes.

## Regra adicional do Kanban/Funil

Ao trabalhar em Pipeline/Kanban, preservar esta separacao:

- `conversations.stage` = estado operacional do Desk (`bot_triage`, `awaiting_human`, `in_service`, `resolved`)
- `conversations.labels[]` = posicao do funil customizado do Kanban (`etapa_triagem`, etc.)

Implicacoes:

- mover card no Kanban nunca deve gravar slug customizado em `stage`
- criacao inbound do bot continua com `stage = 'bot_triage'`
- criacao outbound do operador continua com `stage = 'in_service'`
- backfill de dados antigos deve recuperar labels de funil sem reabrir a mistura entre os dois conceitos

## Estado atual validado no workspace

### WhatsApp / Evolution

Ja existe implementacao parcial e coerente com o plano em:

- `src/lib/whatsapp/connection-state.ts`
- `src/lib/whatsapp/qrcode-cache.ts`
- `src/app/api/whatsapp/instances/[instanceName]/status/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/qrcode/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/public-qr/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/repair-sync/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/pairing-code/route.ts`
- `src/lib/api/evolution.ts`
- `src/app/connect/[instanceName]/page.tsx`
- `src/components/client-detail/whatsapp-connection-panel.tsx`
- `src/components/onboarding/steps/whatsapp-connect.tsx`
- `src/app/api/webhooks/evolution/route.ts`

Sinais bons:

- existe servico central de reconciliacao de estado
- existe contrato unificado de resposta (`state`, `base64`, `pairingCode`, `connectedPhone`, `lastUpdatedAt`)
- o fluxo publico de QR ja usa cache para evitar `connect` em todo poll
- existe endpoint de `repair-sync`
- existe endpoint de `pairing-code`
- `setWebhook()` ja usa `POST /webhook/set/{instance}`, que e o endpoint correto

### Agenda

Ja existe base parcial do rebuild em:

- `src/lib/agenda/constants.ts`
- `src/lib/agenda/service.ts`
- `src/app/api/agenda/route.ts`
- `src/app/api/agenda/[id]/route.ts`
- `src/app/api/agenda/[id]/status/route.ts`
- `src/components/agenda/agenda-workspace.tsx`
- `src/app/(admin)/agenda/agenda-client.tsx`
- `src/app/(admin)/clients/[id]/appointments/page.tsx`
- `src/app/chatwoot/agenda/page.tsx`
- `supabase/migrations/018_agenda_framework.sql`

Sinais bons:

- API de agenda ja foi expandida para `GET`, `POST`, `PATCH` e `DELETE`
- service da agenda ja trata listagem, criacao, edicao, cancelamento e status
- migration 018 ja adiciona campos operacionais e normalizacao de status
- a direcao tecnica esta correta: Supabase primeiro, Google como sync opcional

## Validacao feita agora

Comando executado:

```bash
cmd /c npm test
```

Resultado:

- 11 arquivos de teste passaram
- 1 arquivo de teste falhou: `tests/agenda-status.route.test.ts`
- total: 19 testes passaram, 2 falharam

Falhas observadas:

1. A rota `PATCH /api/agenda/[id]/status` esta retornando `404` onde o teste antigo esperava `403`.
2. A mesma rota retornou `500` em um teste por causa do erro `Unexpected table: conversations`.

Interpretacao:

- A frente WhatsApp esta mais adiantada e com boa cobertura.
- A frente Agenda ainda precisa alinhar implementacao e testes antigos, principalmente na rota de status.
- Nao assumir que a Agenda esta pronta so porque a migration e os endpoints novos existem.

Tentativa de build:

```bash
cmd /c npm run build
```

Resultado:

- falhou porque ja havia outro `next build` em execucao no ambiente (`Another next build process is already running`)
- portanto, o build precisa ser revalidado depois em ambiente limpo

## Ordem de trabalho obrigatoria

1. Preservar tudo que ja foi alterado e evitar refactor largo.
2. Fechar a frente WhatsApp/Evolution ate ficar estavel, testada e com contrato consistente.
3. So depois estabilizar a Agenda, com foco em compatibilidade de API, migration e testes.
4. Antes de qualquer commit, rodar testes e build novamente.

## Objetivo imediato recomendado

Fechar primeiro a frente WhatsApp/Evolution, porque ela esta mais perto da linha de chegada e e uma dor operacional direta.

Checklist de conclusao da frente WhatsApp:

- garantir que `connection.update` realmente sincroniza `panel_whatsapp_config`
- garantir que `status`, `qrcode`, `public-qr`, `repair-sync` e `pairing-code` usam o mesmo contrato de resposta
- garantir que `public-qr` nunca fique chamando `connect` a cada poll
- quando estado real for `open`, limpar QR local e impedir UI de oferecer reconexao
- validar se `connected_phone` esta sendo extraido de forma confiavel; se nao estiver, manter best effort sem quebrar o restante
- revisar o endpoint `/api/health/[instanceName]` para garantir compatibilidade com a nova leitura de estado usada na pagina publica
- executar toda a suite de testes WhatsApp novamente

## Objetivo imediato secundario

Depois do WhatsApp, alinhar a Agenda sem expandir escopo alem do necessario agora.

Checklist de continuidade da Agenda:

- corrigir a rota `PATCH /api/agenda/[id]/status` para comportamento consistente com o contrato desejado
- decidir explicitamente se recurso inexistente/fora do escopo do cliente retorna `403` ou `404`, e alinhar implementacao + testes
- ajustar mocks/testes antigos que ainda nao refletem a nova dependencia de `conversations` e `appointments`
- validar `GET /api/agenda`, `POST /api/agenda`, `PATCH /api/agenda/[id]` e `DELETE /api/agenda/[id]`
- validar a migration `018_agenda_framework.sql` contra o uso real no codigo
- manter Google Calendar como sync opcional; nunca bloquear operacao local da Agenda por falha externa

## Guardrails tecnicos

- Nao reintroduzir Chatwoot como dependencia funcional do pipeline novo. Chatwoot e legado.
- No WhatsApp, o webhook correto da Evolution e `POST /webhook/set/{instance}` apontando para `/api/webhooks/evolution`.
- `appointments` no Supabase continua sendo a fonte de verdade da Agenda.
- Google Calendar e derivado/opcional.
- Nao criar tabela nova sem confirmar primeiro se algo equivalente ja existe em `CLAUDE.md` e nas migrations.
- Se houver divergencia entre implementacao atual e teste antigo, atualizar com criterio; nao "maquiar" erro para fazer teste passar.

## Arquivos com maior chance de exigir atencao imediata

WhatsApp:

- `src/lib/whatsapp/connection-state.ts`
- `src/app/api/webhooks/evolution/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/status/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/public-qr/route.ts`
- `src/app/api/whatsapp/instances/[instanceName]/qrcode/route.ts`
- `src/app/connect/[instanceName]/page.tsx`
- `tests/whatsapp-*.test.ts`

Agenda:

- `src/app/api/agenda/[id]/status/route.ts`
- `src/lib/agenda/service.ts`
- `tests/agenda-status.route.test.ts`
- `supabase/migrations/018_agenda_framework.sql`

## Definicao de pronto minima antes de encerrar

- `cmd /c npm test` sem falhas
- `cmd /c npm run build` em ambiente sem outro build concorrente
- nenhuma regressao visivel nas rotas de WhatsApp
- Agenda com rota de status consistente e suite verde
- sem revert de mudancas do workspace feitas anteriormente

## Se precisar escolher entre velocidade e escopo

Escolher estabilidade.

Prioridade real:

1. WhatsApp/Evolution confiavel
2. testes verdes
3. Agenda coerente
4. refinamentos de UI e expansoes de escopo
