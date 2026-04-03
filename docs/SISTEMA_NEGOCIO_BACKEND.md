# Sistema: negocio, features e backend

## Objetivo deste documento

Este documento explica o sistema como produto e como operacao tecnica, mas em linguagem de negocio.
O foco e responder:

- O que o sistema faz de ponta a ponta
- Quem usa o que
- Onde cada informacao fica salva
- O que acontece quando nasce um novo cliente
- O que acontece quando entra uma nova mensagem
- Quais regras de negocio controlam agenda, handoff, follow-up e atendimento humano
- Onde a arquitetura ja esta forte e onde ela ainda pede consolidacao

## Escopo e baseline

- Data da leitura: 2026-04-02
- Branch inspecionada no workspace: `fix/whatsapp-evolution-monitoring`
- Main local sincronizada previamente: `f708ba1`
- Leitura baseada em codigo real, nao apenas em README

Observacao importante:
A estrutura macro ja esta bem clara e madura. A `main` local tem correcoes adicionais recentes de agenda e conectividade, mas a espinha dorsal do sistema ja aparece nesta base e foi confirmada pelos arquivos principais.

## Resumo executivo

O sistema e um painel multi-tenant para operar clientes que atendem e agendam pelo WhatsApp.

Cada cliente do painel representa uma operacao isolada, com:

- uma instancia propria na Evolution API
- uma account propria no Chatwoot
- configuracao propria do bot
- configuracao propria de agenda
- operadores proprios no painel/desk

O sistema tem dois blocos de dados muito diferentes:

1. Dados de estrutura do cliente
   Sao os dados do tenant, onboarding e configuracao.
   Ex.: `panel_clients`, `panel_whatsapp_config`, `panel_google_config`, `panel_bot_config`.

2. Dados operacionais do dia a dia
   Sao os dados dos pacientes e do atendimento em producao.
   Ex.: `contacts`, `conversations`, `messages`, `appointments`, `followup_logs`.

Essa separacao e a chave para entender o backend.

Em linguagem simples:

- `cliente` = a clinica/negocio que contrata o sistema
- `contato` = o paciente/lead que conversa com esse cliente no WhatsApp
- `conversa` = o caso/atendimento em andamento entre um contato e um cliente
- `mensagem` = cada interacao dentro da conversa
- `agendamento` = o evento/calendario ligado a uma conversa

## O que o produto entrega

### Para a Sales Tec / operacao central

- cadastro e onboarding de novos clientes
- provisionamento de Chatwoot e WhatsApp
- configuracao do bot por cliente
- acompanhamento de saude operacional
- auditoria das acoes administrativas
- visao consolidada de clientes e status

### Para a clinica / cliente

- WhatsApp conectado em instancia dedicada
- bot com linguagem, servicos, horarios e regras proprias
- agenda operacional
- pipeline de conversas
- desk para atendimento humano
- follow-ups automaticos

### Para o operador humano

- login proprio no painel
- escopo preso ao proprio cliente
- acesso ao Desk
- atribuicao de conversas
- resposta manual e envio de midia
- visao de agenda e pipeline do proprio cliente

### Para o paciente

- atendimento por WhatsApp
- triagem automatica
- possibilidade de agendamento
- follow-up automatico
- transferencia para humano quando necessario

## Atores e acessos

### 1. Admin

Papel:
- usuario da Sales Tec
- ve todos os clientes
- cria cliente
- cria e repara integracoes
- gerencia operadores
- acessa dashboard, clientes, settings, SOC

Origem do acesso:
- Supabase Auth
- tabela `panel_users` com `role = 'admin'`

### 2. Operator

Papel:
- usuario da clinica
- fica preso a um unico `client_id`
- usa desk, agenda, pipeline, follow-ups e conta

Origem do acesso:
- Supabase Auth
- tabela `panel_users` com `role = 'operator'` e `client_id` obrigatorio

### 3. Embed

Papel:
- acesso tokenizado para apps embutidos no Chatwoot
- usado para exibir Pipeline e Agenda dentro do Chatwoot

Origem do acesso:
- tabela `panel_embed_tokens`

### Regra estrutural de acesso

O sistema mistura duas camadas de seguranca:

- redirecionamento e gating na aplicacao
- RLS no Supabase para as tabelas `panel_*`

Resultado pratico:

- admin pode ler e escrever em toda a estrutura do painel
- operator so enxerga o proprio cliente
- embed nao entra no painel inteiro; ele autentica chamadas especificas via token

## Estrutura de dados: onde cada coisa fica salva

### Camada 1: tenant, onboarding e configuracao

#### `panel_clients`

E o cadastro central do cliente.

Guarda:
- nome do negocio
- responsavel
- email
- telefone
- status do onboarding/operacao
- credenciais principais do Chatwoot em alguns fluxos
- lista de agentes Chatwoot provisionados

Pense nela como:
"a ficha mestre da clinica dentro do sistema"

#### `panel_whatsapp_config`

Guarda a configuracao tecnica da integracao WhatsApp daquele cliente.

Guarda:
- nome da instancia Evolution
- id/token da instancia
- estado de conexao
- telefone conectado
- datas de conexao/desconexao
- inbox/account/token do Chatwoot associados ao WhatsApp

Pense nela como:
"a amarracao tecnica entre cliente, WhatsApp e Chatwoot"

#### `panel_google_config`

Guarda a configuracao de agenda daquele cliente.

Guarda:
- email Google de referencia
- `calendar_id`
- tokens OAuth, quando usados

Pense nela como:
"a configuracao de agenda do cliente"

#### `panel_bot_config`

E a configuracao comportamental e operacional do bot.

Guarda:
- nome do profissional
- segmento
- servicos
- horarios
- duracao e regras de agendamento
- tom da IA
- guias de processo
- regras de handoff
- regras de intake
- templates de follow-up
- labels/etapas do funil

Pense nela como:
"o cerebro configuravel do cliente"

#### `panel_users`

Guarda os usuarios humanos do sistema.

Guarda:
- id do usuario do Auth
- email
- role (`admin` ou `operator`)
- `client_id` do operator
- nome de exibicao
- flag de ativo/inativo

Pense nela como:
"a matriz de permissao do painel"

#### `panel_embed_tokens`

Guarda tokens para apps embutidos no Chatwoot.

Guarda:
- token
- `client_id`
- usuario que criou
- label do uso
- ultimo uso

Pense nela como:
"a porta controlada para abrir Agenda e Pipeline dentro do Chatwoot"

#### `panel_audit_log`

Guarda trilha administrativa.

Exemplos:
- cliente criado
- bot salvo
- cliente ativado
- instancia criada
- reparo executado

Pense nela como:
"o historico do que a operacao mudou"

#### `panel_health_checks`

Guarda rastros de saude operacional.

Pense nela como:
"o historico de monitoramento"

### Camada 2: operacao do dia a dia com o paciente

#### `contacts`

E o paciente/lead de um cliente.

Guarda:
- nome
- telefone
- identificador WhatsApp
- `client_id`
- `custom_data` do intake
- `intake_completed_at`

Ponto-chave:
um `contact` nao e a clinica.
E o usuario final que conversa com a clinica.

#### `conversations`

E o caso/atendimento em andamento.

Guarda:
- `contact_id`
- `client_id`
- status
- stage
- labels
- operador atribuido
- resumo de triagem
- timestamps de ultima entrada/saida
- dados de follow-up

Pense nela como:
"a unidade principal de trabalho do sistema"

#### `messages`

Guarda cada mensagem trafegada.

Guarda:
- `conversation_id`
- `client_id`
- conteudo
- tipo
- origem (`lead`, `ai`, `human`)
- `evolution_message_id`
- `media_url` quando ha midia persistida

#### `appointments`

Guarda o agendamento ligado a uma conversa.

Guarda:
- `conversation_id`
- `contact_id`
- `google_event_id`
- inicio/fim
- status
- link de meet
- campos de confirmacao/lembrete

#### `followup_logs`

Guarda o historico do que foi enviado nos follow-ups.

#### `followup_cadence_steps`

Guarda a idempotencia dos passos de follow-up.

Na pratica:
evita enviar o mesmo passo duas vezes.

#### `ai_pauses`

Guarda travas temporarias para o bot nao processar a mesma conversa em duplicidade.

## Fluxo de onboarding: do zero ate operacao

## Etapa 1: criar o cliente

Fluxo:
- UI envia `POST /api/clients`
- backend valida autenticacao
- backend cria registro em `panel_clients` com status `draft`
- backend tenta provisionar Chatwoot imediatamente
- backend salva auditoria

O que ja pode acontecer aqui:

- a account do Chatwoot do cliente pode nascer antes mesmo do WhatsApp
- webhooks do Chatwoot podem ser configurados nessa etapa
- labels padrao do funil podem ser criadas
- agentes adicionais do Chatwoot podem ser provisionados

O que fica salvo:

- `panel_clients` recebe o cadastro do cliente
- `panel_clients` pode receber `chatwoot_account_id`, `chatwoot_agent_token` e `chatwoot_email`
- `panel_audit_log` recebe o evento

Importante:
nessa etapa ainda nao existe necessariamente a instancia WhatsApp.

## Etapa 2: criar a instancia WhatsApp

Fluxo:
- UI envia `POST /api/whatsapp/instances`
- backend busca o cliente
- se o cliente ja tem account Chatwoot provisionada, ela e reutilizada
- se nao tem, backend cria uma nova account Chatwoot
- backend configura webhook do Chatwoot para o painel
- backend sincroniza labels do funil
- backend provisiona agentes adicionais se for necessario
- backend cria a instancia na Evolution
- backend configura webhook da Evolution para o painel
- backend garante integracao Evolution -> Chatwoot
- backend tenta descobrir a inbox gerada no Chatwoot
- backend salva `panel_whatsapp_config`
- backend atualiza status do cliente para `pending_whatsapp`
- backend registra auditoria

O que fica salvo:

- `panel_whatsapp_config` nasce aqui
- `panel_clients` e atualizado com credenciais Chatwoot
- `panel_audit_log` registra o evento

O que ainda nao fica salvo:

- nenhum `contact`
- nenhuma `conversation`
- nenhuma `message`

Essas tabelas so nascem quando entra trafego real de paciente.

## Etapa 3: configurar agenda

Fluxo:
- UI envia `POST /api/clients/[id]/calendar-config`
- backend faz upsert em `panel_google_config`
- UI tambem salva templates e regras de agenda em `POST /api/bot-config`

O que fica salvo:

- `panel_google_config`
- parte de agenda em `panel_bot_config`

## Etapa 4: configurar bot

Fluxo:
- UI envia `POST /api/bot-config`
- backend faz upsert completo do `panel_bot_config`
- backend tenta sincronizar labels no Chatwoot, se ja houver credenciais
- backend salva auditoria

O que fica salvo:

- toda a inteligencia configuravel do cliente

## Etapa 5: ativar cliente

Fluxo:
- UI envia `POST /api/clients/[id]/activate`
- backend exige pelo menos:
  - WhatsApp configurado
  - bot configurado
- backend muda status para `active`
- backend registra auditoria
- opcionalmente cria apps de Agenda e Pipeline no Chatwoot

O que isso significa:

so cliente `active` entra no runtime do bot.

## Resposta objetiva: "ao criar um novo cliente, o que acontece?"

Se a pergunta for sobre "nascer uma nova clinica no sistema", a resposta curta e:

1. O sistema cria um registro mestre em `panel_clients`
2. Tenta provisionar uma account Chatwoot para esse cliente
3. Quando voce cria a instancia WhatsApp, ele cria/reutiliza a account Chatwoot e cria a instancia na Evolution
4. Salva a amarracao tecnica em `panel_whatsapp_config`
5. Depois salva agenda em `panel_google_config`
6. Salva o comportamento do bot em `panel_bot_config`
7. Quando ativa, o cliente passa a operar em producao

Se a pergunta for sobre "nascer um novo paciente/contato dentro da operacao", a resposta e outra:

1. Entra uma mensagem via webhook da Evolution
2. O sistema descobre qual cliente dono daquela instancia
3. Faz upsert de `contacts`
4. Faz upsert de `conversations`
5. Salva a mensagem em `messages`
6. Roda IA
7. Pode gerar agenda, handoff, follow-up ou resposta automatica

Ou seja:

- `panel_clients` = cliente contratante
- `contacts` = paciente/lead do cliente

## Runtime do backend: quando entra uma mensagem

### Entrada

A entrada principal hoje e:

- `POST /api/webhooks/evolution`

O webhook recebe eventos da Evolution.

Eventos principais:

- `connection.update`
- `messages.upsert`

### Quando o evento e de conexao

O sistema:

- normaliza o estado da conexao
- atualiza `panel_whatsapp_config`
- se o WhatsApp abriu, pode mover o cliente para `pending_google`

Isso e importante porque:
o status operacional do cliente anda junto com o status real da conexao.

### Quando o evento e mensagem

Fluxo:

1. payload da Evolution e normalizado
2. `runEvolutionPipeline` resolve o cliente pelo `instanceName`
3. o cliente so segue se estiver `active`
4. o sistema faz upsert de `contact`
5. o sistema faz upsert de `conversation`
6. se a conversa esta em atendimento humano, o bot e silenciado
7. a mensagem e salva em `messages`
8. historico recente e carregado
9. o agente de IA roda com prompt dinamico do cliente
10. o dispatcher executa a decisao:
   - responder
   - coletar intake
   - transferir para humano
   - checar agenda
   - criar agendamento
11. o sistema atualiza a conversa
12. libera a trava de IA

## Como o sistema identifica de quem e a mensagem

A chave principal e:

- `panel_whatsapp_config.evolution_instance_name`

Em outras palavras:

- a instancia WhatsApp identifica o cliente
- o cliente identifica a configuracao
- a configuracao define o comportamento da IA

Isso e melhor do que depender apenas de Chatwoot porque prende o tenant ao canal real de entrada.

## Regras de negocio do runtime

### Regra 1: so cliente ativo roda bot

Se `panel_clients.status` nao for `active`, o pipeline para.

Impacto:
- cliente em onboarding nao atende
- cliente pausado nao processa bot

### Regra 2: uma conversa aberta por contato

No fluxo Evolution, o sistema procura conversa nao resolvida por `contact_id + client_id`.

Impacto:
- evita explodir uma conversa nova a cada mensagem
- concentra o historico por caso

### Regra 3: humano tem prioridade

Se a conversa estiver em:

- `awaiting_human`
- `in_service`

o bot nao responde.

Impacto:
- evita disputa entre IA e operador

### Regra 4: uma unica stage label por resposta

A IA pode devolver multiplas labels auxiliares, mas o sistema normaliza para manter:

- exatamente 1 label de etapa (`etapa_*`)

Impacto:
- o pipeline e o follow-up nao perdem coerencia

### Regra 5: handoff abre a conversa

Quando a IA pede humano:

- `status_next` vira `open`
- `reply` vira `null`
- conversa vai para `awaiting_human`
- mensagem de handoff e enviada ao paciente
- resumo e gerado para o operador

### Regra 6: follow-up depende de etapa/cadencia

As labels de etapa podem mapear para:

- `lead`
- `atendimento`
- `agendado`

Esse mapeamento governa qual cron entra em cena.

### Regra 7: intake trava a conversa antes do agendamento

Se intake estiver habilitado:

- o bot coleta campo por campo
- salva em `contacts.custom_data`
- marca `intake_completed_at` quando concluir obrigatorios
- pode pedir fotos
- pode fazer handoff automatico apos fotos

### Regra 8: agenda toma o controle quando a IA detecta agendamento

Quando a IA entende que precisa consultar ou criar agenda:

- ela sinaliza `actions.agenda_check` ou `actions.agenda_create`
- o dispatcher chama o modulo de agenda
- a resposta final pode sair do calendar agent, nao do reply direto da IA

## Stages, status e semantica operacional

### Status do cliente (`panel_clients.status`)

Estados observados:

- `draft`
- `pending_whatsapp`
- `pending_google`
- `configuring`
- `active`
- `paused`
- `disconnected`

Leitura de negocio:

- `draft`: cliente nasceu, mas onboarding nao comecou de verdade
- `pending_whatsapp`: estrutura existe, mas o canal ainda nao abriu
- `pending_google`: WhatsApp conectou, mas ainda falta agenda
- `configuring`: configuracao em andamento
- `active`: pronto para operar
- `paused`: existe, mas esta intencionalmente parado
- `disconnected`: perdeu conexao

### Stage da conversa (`conversations.stage`)

Estados observados:

- `bot_triage`
- `awaiting_human`
- `in_service`
- `resolved`

Leitura de negocio:

- `bot_triage`: IA esta conduzindo
- `awaiting_human`: IA parou e espera humano
- `in_service`: operador assumiu
- `resolved`: caso encerrado

## Features principais e como funcionam

## 1. Onboarding de cliente

Objetivo:
transformar um cliente novo em operacao ativa.

Blocos:
- dados do negocio
- WhatsApp
- agenda
- configuracao do bot
- revisao e ativacao

## 2. Link publico para conectar WhatsApp

Rota:
- `/connect/[instanceName]`

Objetivo:
permitir que o cliente escaneie QR sem entrar no painel.

Como funciona:
- consulta estado real da instancia
- se ainda nao estiver aberta, pede QR novo via Evolution
- usa cache de QR para evitar chamadas desnecessarias

## 3. Desk

Objetivo:
atendimento humano operacional.

Capacidades:
- listar conversas
- entrar em uma conversa
- responder manualmente
- atribuir operador
- iniciar conversa outbound
- enviar midia

Ponto-chave:
o Desk ja nasce no modelo novo, com `client_id`, `operator` e conversa local do sistema.

## 4. Pipeline

Objetivo:
organizar conversas por etapa do funil.

Como funciona:
- busca conversas ativas por cliente
- combina labels/stage com appointments
- exibe colunas conforme `stage_labels` do bot config

## 5. Agenda

Objetivo:
operar os agendamentos ligados as conversas.

Como funciona:
- appointments sao lidos por `conversations.client_id`
- agenda e vista do cliente, nao de um canal isolado

## 6. Follow-ups

Tres motores:

- `lead`: quando o bot falou por ultimo e o lead esfriou
- `atendimento`: quando o paciente falou por ultimo e o atendimento esfriou
- `agendado`: quando existe consulta futura

Mecanismos de seguranca:

- horario comercial
- janelas de envio
- idempotencia por `followup_cadence_steps`
- log em `followup_logs`

## 7. Handoff

Objetivo:
tirar a IA de cena quando humano deve entrar.

Gatilhos:
- urgencia
- reclamacao/negatividade
- palavras-chave
- incapacidade de entender
- regras configuradas por cliente

## 8. Intake estruturado

Objetivo:
coletar informacoes do paciente antes de avancar.

Valor:
- padroniza triagem
- melhora qualidade do atendimento humano
- cria base para agendamento e diagnostico

## Integracoes externas: quem faz o que

### Evolution API

Responsavel por:
- criar instancia WhatsApp
- gerar QR code
- informar estado de conexao
- enviar mensagem
- receber mensagem

O sistema salva localmente:
- identidade da instancia
- estado da conexao
- historico de mensagens

### Chatwoot

Responsavel por:
- account isolada do cliente
- inbox associada ao canal
- agentes humanos
- labels
- dashboard apps embutidos

No estado atual do sistema:
o Chatwoot ainda e importante como camada operacional e de integracao, mas o backend do painel ja assumiu boa parte da logica antes concentrada fora dele.

### Supabase

Responsavel por:
- banco principal
- auth
- RLS
- storage de midia

E a fonte principal de verdade do sistema.

### Google Calendar

Responsavel por:
- calendario dos agendamentos
- criacao/patch/delete de eventos

O sistema salva um espelho operacional em `appointments`.

### OpenAI

Responsavel por:
- decisao do bot
- classificacao de etapa/status/intencao
- resumo de triagem no handoff

## Onde a arquitetura ja esta forte

- separacao razoavel entre configuracao do cliente e operacao do paciente
- isolamento por `client_id`
- gate por status do cliente
- desk com escopo de operador
- persistencia local de mensagens e appointments
- follow-up com idempotencia
- auditoria administrativa
- cleanup em falha parcial de provisionamento
- cache e reconciliacao de estado para QR/conexao

## Onde ainda ha debito arquitetural

### 1. Chatwoot como fonte duplicada de credenciais

Hoje as credenciais do Chatwoot aparecem em dois lugares:

- `panel_clients`
- `panel_whatsapp_config`

Sinal disso:
- existe rota de repair
- existe backfill
- varias rotas fazem fallback de uma tabela para outra

Leitura de arquitetura:
o sistema ainda nao fechou uma unica fonte de verdade para credenciais Chatwoot.

### 2. Modelo misto: novo core por `client_id`, mas legado ainda visivel por `account_id`

Parte do sistema ja opera pelo modelo novo:

- `client_id`
- `instanceName`
- `contacts/conversations/messages`

Mas ainda existe codigo relevante orientado a:

- `chatwoot_account_id`
- `conversations.account_id`

Isso mostra que a migracao de modelo ainda esta em transicao.

Leitura de arquitetura:
o sistema ja tem um core moderno, mas ainda arrasta dependencias do modelo antigo.

### 3. Regras de negocio espalhadas

As regras vivem em muitos lugares:

- rotas API
- pipeline
- dispatcher
- calendar agent
- follow-up services
- prompt da IA

Leitura de arquitetura:
o sistema funciona, mas o dominio ainda esta mais distribuido do que ideal para manutencao longa.

### 4. `panel_bot_config` concentra muito contexto

Vantagem:
- um unico lugar para configurar o comportamento

Risco:
- tabela muito grande
- contratos amplos
- maior chance de regressao transversal

### 5. Provisionamento e operacao ainda se encostam bastante

O onboarding ja faz varias chamadas externas, gravacoes e sincronizacoes em cascata.

Leitura de arquitetura:
isso acelera operacao, mas aumenta superficie de falha parcial.

## O que eu atacaria primeiro numa otimizacao de ponta a ponta

### Fase 1: consolidar fontes de verdade

Objetivo:
parar de perguntar "o dado certo esta em qual tabela?"

Prioridades:
- definir se credencial Chatwoot mora em `panel_clients` ou `panel_whatsapp_config`
- documentar dono oficial de cada campo
- eliminar fallbacks que viraram permanentes

### Fase 2: formalizar servicos de dominio

Objetivo:
tirar regra importante de rotas HTTP.

Servicos naturais:
- `ClientProvisioningService`
- `WhatsAppProvisioningService`
- `ChatwootProvisioningService`
- `ConversationLifecycleService`
- `FollowupOrchestrator`
- `ActivationService`

### Fase 3: explicitar maquinas de estado

Objetivo:
reduzir comportamento implicitamente espalhado.

Maquinas prioritarias:
- status do cliente
- stage da conversa
- lifecycle do onboarding
- lifecycle do agendamento

### Fase 4: separar melhor runtime do bot vs runtime humano

Objetivo:
ficar impossivel IA e operador brigarem pela conversa.

Pontos:
- regras de silenciamento
- ownership da conversa
- handoff e retomada

### Fase 5: observabilidade

Objetivo:
descobrir gargalo antes de quebrar operacao.

Pontos:
- tempos de provisionamento
- taxa de falha por integracao
- tempo medio ate handoff
- taxa de conversa sem stage valida
- taxa de QR expirado

## Mapa mental rapido

```text
CLIENTE NOVO
  -> panel_clients
  -> Chatwoot account
  -> Evolution instance
  -> panel_whatsapp_config
  -> panel_google_config
  -> panel_bot_config
  -> status active

PACIENTE MANDA MENSAGEM
  -> webhook Evolution
  -> resolve client pela instance
  -> upsert contact
  -> upsert conversation
  -> salva message
  -> roda IA
  -> responde OU agenda OU handoff
  -> atualiza conversation
  -> dispara follow-up quando aplicavel
```

## Leitura final em uma frase

O sistema ja deixou de ser apenas "um painel que cria instancias" e hoje e, na pratica, um backend multi-tenant de operacao comercial e assistencial via WhatsApp, com onboarding, automacao, agenda, atendimento humano e funil compartilhando a mesma base operacional.
