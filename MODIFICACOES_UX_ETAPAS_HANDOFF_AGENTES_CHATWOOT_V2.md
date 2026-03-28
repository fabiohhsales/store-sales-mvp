# Modificacoes Realizadas
## UX de Etapas + Handoff + Agentes Chatwoot (v2 - pos-v3reestructure)

Data: 28/03/2026
Projeto: painel2-atualizado

## 1. Contexto

Este documento registra as alteracoes implementadas para a entrega:
- UX de Etapas
- Handoff
- Provisionamento de Agentes Chatwoot no onboarding

Base considerada:
- v3reestructure ja integrado
- Fluxo de OAuth legado removido
- Step 3 do onboarding permanece em configuracao de agenda

## 2. Escopo Entregue

### 2.1 UX de Etapas

Objetivo:
- reduzir erro humano na configuracao de etapas
- remover edicao manual do identificador tecnico

Alteracoes implementadas:
- renomeacao de labels para linguagem de negocio
- campo tecnico de etiqueta no chat exibido como somente leitura
- inclusao de opcoes de follow-up em desenvolvimento no select, desabilitadas

Arquivo alterado:
- src/components/bot-config/stages-labels-section.tsx

Detalhes:
- "Nome amigavel" -> "Nome da Etapa"
- "Slug tecnico" -> "Nome da etiqueta no chat (gerado automaticamente)"
- "Vinculo com Follow-up" -> "Follow Up com IA"
- opcoes adicionadas e desabilitadas:
  - Paciente (em desenvolvimento)
  - Nutricao de perdidos (em desenvolvimento)

Comportamento preservado:
- slug continua sendo gerado automaticamente e congelado quando ja existe

### 2.2 Handoff

Objetivo:
- expor placeholders de notificacao por e-mail sem impacto funcional

Alteracoes implementadas:
- adicao de switch visual desabilitado para notificacao por e-mail
- adicao de input visual desabilitado para e-mail desejado

Arquivo alterado:
- src/components/bot-config/handoff-section.tsx

Detalhes:
- "Notificar via e-mail (em desenvolvimento)"
- "E-mail desejado (em desenvolvimento)"
- sem persistencia em payload
- sem logica de execucao

### 2.3 Contrato e Validacao de Etapas

Objetivo:
- garantir que backend aceite apenas cadencias suportadas

Alteracao implementada:
- validacao da propriedade followup_cadence em stage_labels no schema

Arquivo alterado:
- src/lib/validations/bot-config.ts

Detalhes:
- valores aceitos: lead, atendimento, agendado, null
- opcoes em desenvolvimento seguem apenas visuais na UI

### 2.4 Onboarding com Multiagente Chatwoot

Objetivo:
- permitir cadastrar agentes adicionais no onboarding
- provisionar esses agentes no Chatwoot apos criacao da conta
- manter resiliencia em caso de erro parcial

Frontend implementado:
- lista dinamica de agentes adicionais no step Dados do Negocio
- campos por agente:
  - nome
  - e-mail
  - papel (agent ou administrator)
- validacoes client-side:
  - nome obrigatorio
  - e-mail valido
  - sem e-mails duplicados na lista
- envio de chatwoot_users no POST de criacao de cliente

Arquivo alterado:
- src/components/onboarding/steps/business-data.tsx

Backend implementado (criacao de cliente):
- parse e validacao de chatwoot_users
- retorno 400 para payload invalido
- persistencia de provisioned_agents no registro de cliente
- auditoria com contagem de agentes provisionados

Arquivo alterado:
- src/app/api/clients/route.ts

Backend implementado (Chatwoot API):
- nova funcao createChatwootAgent(accountId, accountToken, agent)
- tratamento idempotente de conflito de e-mail (status exists)

Arquivo alterado:
- src/lib/api/chatwoot.ts

Backend implementado (fluxo de instancia WhatsApp):
- leitura de provisioned_agents do cliente
- provisionamento de agentes apos criacao da account Chatwoot
- resumo de execucao por status:
  - created
  - existing
  - failed
- falha parcial nao interrompe o onboarding

Arquivo alterado:
- src/app/api/whatsapp/instances/route.ts

Tipagem implementada:
- tipos de input e role de agente Chatwoot
- campo provisioned_agents no tipo de cliente

Arquivos alterados:
- src/types/api.ts
- src/types/database.ts

Banco de dados:
- nova migration para armazenar agentes provisionados por cliente

Arquivo criado:
- supabase/migrations/007_panel_clients_provisioned_agents.sql

## 3. Lista Consolidada de Arquivos Alterados

- src/components/bot-config/stages-labels-section.tsx
- src/components/bot-config/handoff-section.tsx
- src/lib/validations/bot-config.ts
- src/components/onboarding/steps/business-data.tsx
- src/app/api/clients/route.ts
- src/lib/api/chatwoot.ts
- src/app/api/whatsapp/instances/route.ts
- src/types/api.ts
- src/types/database.ts
- supabase/migrations/007_panel_clients_provisioned_agents.sql

## 4. Validacoes Executadas

- ESLint: executado com sucesso, sem erros e sem warnings apos ajuste final
- Build Next.js: compilacao validada via comando compativel com Windows PowerShell

Observacao operacional:
- o script padrao de build no package usa sintaxe de variavel de ambiente estilo Unix
- no Windows, a validacao foi feita com definicao de NODE_OPTIONS via PowerShell

## 5. Compatibilidade e Risco

Compatibilidade:
- fluxo v3reestructure mantido
- step de agenda nao foi alterado
- nao houve retorno ao modelo antigo de OAuth

Riscos mitigados:
- erros de cadastro de agentes com validacao no frontend e backend
- duplicidade de e-mail tratada localmente e no Chatwoot
- conflito de agente existente tratado como caso nao bloqueante

## 6. Pendencias Operacionais

Para concluir rollout em ambiente alvo:
1. executar migration 007 no banco
2. realizar smoke test de onboarding com:
   - 0 agentes
   - 1 agente
   - N agentes
3. validar retorno de agents_summary no endpoint de criacao de instancia
4. validar comportamento com e-mail ja existente no Chatwoot

## 7. Resultado

A entrega v2 foi implementada com foco em:
- clareza de UX nas etapas
- placeholders de handoff sem impacto de regra atual
- onboarding com provisionamento multiagente resiliente

Status: implementado e validado localmente (lint e build).