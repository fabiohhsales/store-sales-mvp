# Roadmap de Melhorias ChatSales (Admin + Client)

## 1. Contexto e objetivo

Este roadmap consolida:
- Demandas do documento ClickUp (Projeto Grecia)
- Ajustes sugeridos para os menus e jornadas Admin/Client
- Melhorias de UX e operação para Desk, Pipeline, Follow Ups, Agenda, Contatos, Dashboard e Configurações
- Priorização prática por impacto e esforço

Objetivo: transformar o escopo em plano executável, com entregas por sprint, critérios de aceite e dependências técnicas.

## Status de execução (2026-03-31)

Implementações concluídas neste ciclo:
- P0.2 Agenda hardening:
  - normalização de status para canonical noshow (com compatibilidade legado no_show)
  - melhoria do tratamento de erro com errorId para suporte
  - logs de observabilidade com requestId na API de Agenda
- P0.3 Desk no acesso client:
  - inclusão do menu Desk no modo client (sidebar desktop e mobile)
  - deep-link de conversa no Desk via query param
- Pipeline modal expandido + nova conversa:
  - botão Nova conversa na tela de Pipeline
  - modal de detalhe expandido com resposta inline
  - auto-move configurável após reply inline para etapa escolhida pelo usuário
  - atalho Ir para o Desk na conversa
  - endpoint dedicado para resposta rápida no pipeline
- Agenda observabilidade + UX de erro:
  - telas de Agenda com mensagens de erro mais claras
  - exibição de ID de erro para rastreio
  - ação de recarga explícita no erro
- Follow Ups (tipo client) - visão operacional:
  - nova tela de Follow Ups com fluxo por cadência (lead/atendimento/agendado)
  - contadores de níveis, conversas sem resposta e tentativas
  - timeline de eventos recentes de follow-up enviados

---

## 2. Tipos de acesso e visão de produto

### Admin (acesso interno)
Responsabilidades principais:
- Criar novos clientes (manual ou via fluxo de onboarding)
- Provisionar estrutura do cliente (acessos, configs, integrações)
- Operar SOC
- Monitorar clientes sem resposta nas últimas 24h
- Consultar logs com filtro por cliente

### Client (acesso do cliente final)
Responsabilidades principais:
- Operar atendimento (Desk)
- Acompanhar Pipeline
- Gerenciar Follow Ups
- Usar Agenda
- Acompanhar métricas no Dashboard
- Gerenciar Configurações de setup, agentes e integrações

---

## 3. Diagnóstico do estado atual (código)

Resumo do que já existe:
- Sidebar com modo Admin/Client e menus separados
- Desk com APIs de conversa, ação, atribuição e analytics
- Pipeline em Kanban com drag and drop, modal e API de movimentação
- Agenda com visão calendário/lista e APIs de leitura/status
- Follow-up engine com cadências lead, atendimento e agendado
- SOC já implementado no admin

Gaps observados que afetam o roadmap:
- Menu Client atual não expõe Desk e Follow Ups de forma dedicada
- Pipeline: movimentação atualiza labels, mas não atualiza stage em conversations
- Agenda: inconsistências de status e pontos de confiabilidade percebidos como "full bugado"
- Não há área de Contatos dedicada no menu
- Dashboard do cliente ainda não centraliza métricas operacionais solicitadas

---

## 4. Backlog priorizado (P0/P1/P2)

## P0 - Estabilidade e operação crítica

### P0.1 Pipeline: corrigir mudança de etapa travada
Problema:
- O board movimenta cards, porém a API de move não persiste stage na conversa.

Impacto:
- Regressão na principal operação de funil.

Entregas:
- Ajustar API de move para persistir stage e labels de forma consistente
- Garantir que leitura do board reflita stage atualizado após refresh
- Log de auditoria de mudança de etapa

Critérios de aceite:
- Drag and drop persiste após recarregar
- Mudança via modal também persiste
- Sem divergência entre coluna exibida e dados no banco

### P0.2 Agenda: hardening funcional
Problema:
- Agenda reportada como instável/não funcional em uso real.

Entregas:
- Revisar filtros e retorno de appointments por client_id
- Padronizar enum de status (no_show vs noshow)
- Ajustar atualização de status e exibição unificada na UI
- Telemetria de erros da Agenda (API + front)

Critérios de aceite:
- Listagem consistente para cliente com appointments válidos
- Mudança de status refletida imediatamente e após refresh
- Sem status órfão/inconsistente na UI

### P0.3 Desk no acesso Client
Problema:
- Desk não aparece no menu Client.

Entregas:
- Incluir Desk no menu Client
- Definir landing de atendimento para perfil operator/client
- Garantir escopo por client_id sem exposição cruzada

Critérios de aceite:
- Usuário Client entra no Desk sem depender de rota manual
- Sem possibilidade de acessar dados de outro cliente

---

## P1 - Ganho de produtividade comercial

### P1.1 Mini SOC do atendente (antes do Overview)
Entregas:
- Painel operacional no Desk com:
  - Leads em atendimento
  - Conversas aguardando humano
  - SLA estourando
  - Conversas sem resposta em X horas

Critérios de aceite:
- Operador visualiza risco operacional em < 5s
- Cards com navegação direta para conversa

### P1.2 Desk com mídia e campos "em aberto"
Entregas:
- Suporte visual para áudio e imagem no Desk
- Exibir campos de intake mesmo sem preenchimento
- Exibir etiquetas e etapa da conversa de forma fixa

Critérios de aceite:
- Mensagens com mídia renderizam no histórico
- Operador entende estado do lead sem abrir telas extras

### P1.3 Pipeline evoluído
Entregas:
- "Nova conversa" com disparo de mensagem inicial
- Exibir todas as etapas, mesmo vazias
- Se cliente sem etapas configuradas, usar padrão
- Expandir detalhe do card com ações rápidas:
  - Ir para conversa
  - Responder no modal

Critérios de aceite:
- Fluxo completo sem sair da tela de Pipeline
- Ações do card reduzem tempo de atendimento

### P1.4 Menu Follow Ups com visão operacional
Entregas:
- Tela dedicada com visão Kanban/fluxo de cadências
- Estado por etapa (lead, atendimento, agendado)
- Histórico de envios com filtros

Critérios de aceite:
- Operador identifica gargalos de follow-up
- Visualiza progresso por cadência e cliente

---

## P2 - Gestão e escala

### P2.1 Contatos (módulo dedicado)
Entregas:
- Lista de contatos com busca, filtros e últimos eventos
- Drilldown do contato com histórico de conversas e agendamentos

### P2.2 Dashboard do cliente (visão executiva)
Entregas:
- Conversas últimos 7 dias
- Visão de funil por etapa
- Tabela/log de conversas com etapa e temperatura
- Follow ups enviados

### P2.3 Configurações ampliadas
Entregas:
- Setup guiado
- Gestão de agentes (users/operators)
- Credenciais e syncs de integrações em uma área única

---

## 5. Plano por sprint (6 semanas)

### Sprint 1 (Semana 1-2)
Foco: P0 de estabilidade
- Pipeline: correção de persistência de stage
- Agenda: padronização de status + correções de listagem/update
- Menu Client com acesso ao Desk

Saída esperada:
- Núcleo operacional confiável

### Sprint 2 (Semana 3-4)
Foco: produtividade de atendimento
- Mini SOC no Desk
- Desk com mídia + etiquetas/etapa visíveis
- Pipeline com nova conversa e modal expandido

Saída esperada:
- Operação mais rápida para time de atendimento

### Sprint 3 (Semana 5-6)
Foco: gestão e inteligência operacional
- Follow Ups (menu + visão de fluxo)
- Contatos (módulo dedicado)
- Dashboard cliente com métricas do roadmap

Saída esperada:
- Gestão orientada por dados para cliente e operação interna

---

## 6. Arquitetura de implementação (resumo técnico)

Frentes principais no código:
- Sidebar e menus: src/components/layout/sidebar.tsx
- Desk: src/app/desk + src/app/api/desk
- Pipeline UI: src/components/pipeline
- Pipeline API: src/app/api/pipeline
- Agenda UI: src/components/agenda
- Agenda API: src/app/api/agenda
- Follow up engine: src/lib/followup + src/app/api/cron
- Configurações: src/app/(admin)/settings + src/components/settings

Atenção técnica prioritária:
- Garantir consistência entre stage e labels no pipeline
- Unificar enum de status em appointments (DB/API/UI)
- Adicionar métricas e logs para diagnóstico de falhas em produção

---

## 7. KPIs para medir sucesso

Operação:
- Tempo médio para assumir conversa
- Tempo médio de mudança de etapa
- Taxa de erro em mudança de etapa
- Taxa de sucesso de atualização na Agenda

Comercial:
- Conversão por etapa do funil
- Taxa de resposta por cadência de follow-up
- Taxa de reagendamento após no-show

Produto:
- Adoção de Desk (Client)
- Adoção de Follow Ups (menu e ações)
- Redução de tickets de suporte por instabilidade

---

## 8. Decisões recomendadas antes da execução

1. Definir se Follow Ups terá visão Kanban, timeline ou híbrida
2. Fechar dicionário único de status de appointments
3. Definir política padrão de etapas para clientes sem configuração
4. Definir regras de permissão finas para perfis Client vs Admin

---

## 9. Próximos passos imediatos

1. Executar Sprint 1 com branch dedicada de estabilização
2. Criar checklist de QA manual para Pipeline e Agenda
3. Publicar baseline de métricas (antes/depois) para comprovar ganho
